// R1 — incremental structuring: pure state + patch application.
//
// This is the contract R2 will implement against. It is deliberately small and
// has NO IO, NO clock and NO network, so every safety rule below is unit-testable.
//
// It exists because the deployed live path (computeLivePreview → runStructuring)
// recomputes the entire report from the entire transcript on every speech tick.
// That is fine while nobody is editing, and unsafe the moment a radiologist
// touches a section — the next tick would overwrite their words with the
// engine's opinion. It is also unsafe mid-sentence: the engine is a function of
// a COMPLETE transcript, and on partial input it can legitimately return an
// empty report (a dictated "Non." with its replacement not yet spoken retracts
// the previous clause and leaves nothing behind).
//
// The rules encoded here are therefore:
//   1. The transcript is provenance and only ever grows. Structuring never
//      rewrites it.
//   2. A patch never blanks a section that already has content.
//   3. A patch never overwrites a section the radiologist authored. It becomes
//      a suggestion the UI can offer, never a silent write.
//   4. Machine-authored boilerplate (origin 'template', e.g. the default
//      TECHNIQUE protocol) always carries reviewRequired — it is the only text
//      in the pipeline nobody dictated.
//   5. Every decision is logged with its before/after text, so a correction can
//      always be traced back to what it replaced.
//
// Nothing here invents clinical content: a patch can only carry text the
// structuring step produced from the doctor's own words, and an absent section
// stays absent.

import { SECTION_ORDER, type SectionKey } from '@/lib/safety/sections'
import { stableBoundary } from '@/lib/dictation/transcript-stability'
import type { StructuredReportData, SectionProvenanceValue } from '@/types/report'
import type {
  LiveReportState,
  PatchLogEntry,
  PatchResult,
  SectionOrigin,
  SectionState,
  SectionPatch,
  StructuredReportPatch,
} from '@/types/live-structuring'

// ─── Provenance, in memory and on disk ────────────────────────────────────────
//
// R2.7C. Two names for the same three ideas already existed — the live state
// calls the radiologist 'radiologist', the section router calls the same thing
// 'physician_edit'. Rather than add a third, the persisted form reuses the
// router's vocabulary and this pair of tables is the ONLY place the two meet.

const TO_PERSISTED: Record<SectionOrigin, SectionProvenanceValue> = {
  radiologist: 'physician_edit',
  dictation:   'dictation',
  template:    'template',
}

const FROM_PERSISTED: Record<SectionProvenanceValue, SectionOrigin> = {
  physician_edit: 'radiologist',
  dictation:      'dictation',
  template:       'template',
}

/** Live-state origin → the value stored in `structured_data.sectionProvenance`. */
export function toPersistedProvenance(origin: SectionOrigin): SectionProvenanceValue {
  return TO_PERSISTED[origin]
}

// ─── State construction ───────────────────────────────────────────────────────

function emptySection(): SectionState {
  return { text: '', origin: 'dictation', locked: false }
}

function emptySections(): Record<SectionKey, SectionState> {
  return SECTION_ORDER.reduce((acc, key) => {
    acc[key] = emptySection()
    return acc
  }, {} as Record<SectionKey, SectionState>)
}

export function createLiveReportState(init?: {
  transcript?: string
  sections?: Partial<Record<SectionKey, Partial<SectionState>>>
}): LiveReportState {
  const sections = emptySections()
  for (const key of SECTION_ORDER) {
    const seed = init?.sections?.[key]
    if (seed) sections[key] = { ...sections[key], ...seed }
  }
  return { transcript: init?.transcript ?? '', sections, log: [] }
}

/**
 * Seed live state from a report that already exists.
 *
 * R2.7C — when the report records who wrote each section, that is used: only
 * PHYSICIAN-authored sections lock. Dictated and template sections stay open,
 * so continuing a dictation after a reload behaves the way it does before one.
 * They are still protected — the coordinator only auto-applies a proposal that
 * EXTENDS what is on screen; a rewrite is always held back as a suggestion.
 *
 * When the report does NOT record it — every report saved before R2.7C,
 * including the ones already in production — the old conservative rule applies
 * unchanged: any non-empty section is assumed to be the radiologist's and locks.
 * Guessing "dictation" for those would hand pre-existing clinical text back to
 * the engine, which is the one direction this must never fail in.
 */
export function fromStructuredReportData(sd: StructuredReportData): LiveReportState {
  const state = createLiveReportState({ transcript: sd.dictationTranscript ?? '' })
  const text: Record<SectionKey, string> = {
    indication:      sd.indication ?? '',
    technique:       sd.technique ?? '',
    results:         sd.results ?? '',
    conclusion:      sd.conclusion ?? '',
    recommendations: sd.recommendations ?? '',
  }
  for (const key of SECTION_ORDER) {
    const value = text[key].trim()
    if (!value) {
      state.sections[key] = { text: '', origin: 'dictation', locked: false }
      continue
    }
    const stored = sd.sectionProvenance?.[key]
    const origin: SectionOrigin = stored ? (FROM_PERSISTED[stored] ?? 'radiologist') : 'radiologist'
    state.sections[key] = { text: value, origin, locked: origin === 'radiologist' }
  }
  return state
}

/**
 * R2.7C — the persisted authorship map for the sections that hold text.
 *
 * Empty sections are omitted: recording an origin for text that does not exist
 * would make a later reload lock or unlock on the strength of a value nobody set.
 */
export function sectionProvenanceOf(
  state: LiveReportState,
): Partial<Record<SectionKey, SectionProvenanceValue>> {
  const out: Partial<Record<SectionKey, SectionProvenanceValue>> = {}
  for (const key of SECTION_ORDER) {
    const section = state.sections[key]
    if (!section.text.trim()) continue
    out[key] = TO_PERSISTED[section.origin]
  }
  return out
}

// ─── Projection back into the canonical model ─────────────────────────────────

/**
 * Project live state into StructuredReportData — the SAME model that already
 * feeds buildReportExportModel → PDF / DOCX / print / secure delivery. This is
 * what keeps R2 from growing a second report architecture: live dictation ends
 * at the canonical model, it does not run beside it.
 *
 * `base` supplies the identity fields the patch layer does not own (exam type,
 * title, patient block, language, special form). Sections are copied verbatim;
 * an empty section stays empty.
 */
export function toStructuredReportData(
  state: LiveReportState,
  base: StructuredReportData,
): StructuredReportData {
  const recommendations = state.sections.recommendations.text.trim()
  return {
    ...base,
    indication: state.sections.indication.text,
    technique:  state.sections.technique.text,
    results:    state.sections.results.text,
    conclusion: state.sections.conclusion.text,
    ...(recommendations ? { recommendations } : {}),
    dictationTranscript: state.transcript,
    // R2.7C — authorship travels with the content, so a reload knows which
    // sections the radiologist owns instead of assuming all of them.
    sectionProvenance: sectionProvenanceOf(state),
  }
}

// ─── Radiologist authorship ───────────────────────────────────────────────────

/**
 * Record a direct edit. This LOCKS the section: later patches become
 * suggestions instead of writes. The radiologist is the final authority, and
 * that has to hold while dictation is still running.
 */
export function markSectionEdited(
  state: LiveReportState,
  key: SectionKey,
  text: string,
): LiveReportState {
  return {
    ...state,
    sections: {
      ...state.sections,
      [key]: {
        ...state.sections[key],
        text,
        origin: 'radiologist',
        locked: true,
        // A human wrote it; any inherited machine review flag is resolved.
        reviewRequired: false,
      },
    },
  }
}

/** Release a lock so structuring may propose again (explicit user action). */
export function unlockSection(state: LiveReportState, key: SectionKey): LiveReportState {
  return {
    ...state,
    sections: { ...state.sections, [key]: { ...state.sections[key], locked: false } },
  }
}

// ─── Patch application ────────────────────────────────────────────────────────

/**
 * Apply one incremental structuring result.
 *
 * Never throws. Returns the next state plus a per-section decision log and the
 * patches that were withheld, so the caller can surface them as suggestions.
 */
export function applyStructuredPatch(
  state: LiveReportState,
  patch: StructuredReportPatch,
): PatchResult {
  const entries: PatchLogEntry[] = []
  const suggestions: SectionPatch[] = []
  const sections = { ...state.sections }

  // Rule 1 — the transcript only grows. A shorter transcript means the caller
  // handed us a different session (or a reset); we keep the longer record and
  // flag it rather than losing provenance.
  const incoming = patch.transcript ?? ''
  const transcriptRegressed = incoming.length < state.transcript.length
  const transcript = transcriptRegressed ? state.transcript : incoming

  for (const sectionPatch of patch.sections) {
    const key = sectionPatch.key
    const current = sections[key]
    if (!current) continue

    const kind = sectionPatch.kind ?? 'dictated'
    const nextText = (sectionPatch.text ?? '').trim()
    const previousText = current.text

    // Rule 2 — never blank a section that already holds content.
    if (!nextText && previousText) {
      entries.push({ key, outcome: 'skipped_empty', kind, previousText, nextText: previousText })
      continue
    }

    if (nextText === previousText) {
      entries.push({ key, outcome: 'unchanged', kind, previousText, nextText })
      continue
    }

    // Rule 3 — the radiologist owns what they authored.
    if (current.locked) {
      suggestions.push(sectionPatch)
      entries.push({
        key,
        outcome: 'suggested_locked',
        kind,
        previousText,
        nextText,
        sourceRange: sectionPatch.sourceRange,
      })
      continue
    }

    const origin = sectionPatch.origin ?? 'dictation'
    // Rule 4 — machine-authored boilerplate always needs confirmation.
    const reviewRequired =
      origin === 'template' ? true : (sectionPatch.reviewRequired ?? false)

    sections[key] = {
      text: nextText,
      origin,
      locked: false,
      confidence: sectionPatch.confidence,
      reviewRequired,
      sourceRange: sectionPatch.sourceRange,
    }
    entries.push({
      key,
      outcome: 'applied',
      kind,
      previousText,
      nextText,
      sourceRange: sectionPatch.sourceRange,
    })
  }

  return {
    state: { transcript, sections, log: [...state.log, ...entries] },
    entries,
    suggestions,
    transcriptRegressed,
  }
}

// ─── Stability boundary ───────────────────────────────────────────────────────

/**
 * Split a growing transcript into the part that is SAFE to structure and the
 * tail that is not yet.
 *
 * The deterministic engine is a function of a complete transcript. Fed a
 * partial one it can legitimately produce nonsense that later corrects itself —
 * a dictated retraction whose replacement has not been spoken yet empties the
 * report, and an inline marker ("… ou plutôt") prints as clinical text until
 * its replacement arrives. Structuring only the completed-sentence prefix and
 * holding the tail raw removes both classes of flicker without changing the
 * engine.
 *
 * Returns `{ stable, tail }` where `stable` ends at the last sentence
 * terminator. A decimal point (`3.5 cm`) is never treated as a terminator, and
 * a trailing retraction marker keeps its own sentence in the tail so the engine
 * never observes a retraction without its replacement.
 */
export function splitStableTranscript(transcript: string): { stable: string; tail: string } {
  // R2.4 — one algorithm. This delegates to the transcript-stability engine so
  // the R1 contract and the live dictation boundary can never diverge; that
  // engine adds the measurement, negation and laterality guards on top of the
  // decimal and dangling-retraction rules originally implemented here.
  if (!transcript) return { stable: '', tail: '' }
  return stableBoundary(transcript)
}
