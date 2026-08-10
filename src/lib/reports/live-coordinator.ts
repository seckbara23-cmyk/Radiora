// R2.5 — the incremental live structuring coordinator.
//
// This is the module that decides. React components orchestrate (start a
// revision, hand back a result, render the outcome); every clinical judgement
// about what may be written into a report section is made here, where it is
// pure and unit-testable.
//
// WHAT THE ENGINE ACTUALLY DOES ON GROWING INPUT
// Before designing this, runStructuring was measured against growing STABLE
// transcripts (R2.4 boundary, complete sentences only). The result decided the
// architecture:
//
//   rev 4  CONCLUSION = "14 mm."
//   rev 5  CONCLUSION = "Pas de lésion splénique."      ← wholly replaced
//   rev 6  CONCLUSION = "Au total, nodule hépatique…"   ← wholly replaced again
//
// Until the doctor dictates an explicit marker ("Au total", "Conclusion"), the
// engine's conclusion is a positional guess that churns on every sentence. Over
// the same revisions RÉSULTATS only ever GREW — each new text began with the
// previous one. And "14 mm." visibly migrated from CONCLUSION into RÉSULTATS.
//
// Three rules follow directly, and they are the core of this module:
//
//   1. Reprocess the WHOLE stable transcript every revision (strategy A). The
//      engine is a function of a complete transcript; feeding it deltas would
//      be a different engine. Cost is a few ms of local, deterministic work.
//   2. A proposal that EXTENDS what is already shown (the new text starts with
//      the old) is safe to apply. A proposal that REWRITES it is not — that is
//      where the engine's instability lives, and where a doctor would watch
//      their conclusion flicker between unrelated sentences.
//   3. Section reassignment is detected explicitly, never silent.
//
// SAFETY POSTURE
//   • Only the R2.4 stable transcript is ever structured. Interim speech has no
//     path into this module — `reconcile` is given a structuring RESULT, and
//     the only producer is the stable seam.
//   • The radiologist owns anything they touched. A locked section is never
//     written, only offered.
//   • The engine never invents findings; the one machine-authored string in the
//     product (the TECHNIQUE protocol template) can never be SAFE_AUTO_APPLY.
//   • A finalized report freezes: no revision starts, no patch lands.
//
// Pure — no React, no IO, no clock, no network.

import { SECTION_ORDER, type SectionKey, type SectionTextMap } from '@/lib/safety/sections'
import { hasExplicitSectionHeader } from '@/lib/ai/structuring-engine'
import {
  createLiveReportState,
  fromStructuredReportData,
  applyStructuredPatch,
  markSectionEdited,
  unlockSection,
  toStructuredReportData,
} from '@/lib/reports/structured-patch'
import type { HpdStructuringMeta } from '@/lib/ai/hpd-draft'
import type { StructuredReportData } from '@/types/report'
import type { LiveReportState, SectionOrigin, SectionPatch } from '@/types/live-structuring'

// ─── Classification vocabulary ────────────────────────────────────────────────

/**
 * What may happen to a section this revision.
 *
 * The R2.5 brief names four minimum classes. SUGGESTION_ONLY is a fifth, added
 * because the four collapse two genuinely different situations into
 * REVIEW_REQUIRED: content that is safe to show but needs eyes, and content
 * that would DESTROY what the doctor is already reading. Only the first belongs
 * in the report.
 */
export type UpdateClass =
  /** Identical text, or a blank proposal over existing content. Nothing happens. */
  | 'NO_CHANGE'
  /** Written immediately, no flag. */
  | 'SAFE_AUTO_APPLY'
  /** Written and flagged: the target was empty or purely extended, so nothing
   *  is lost, but the content needs a human eye before signing. */
  | 'REVIEW_REQUIRED'
  /** NOT written. Would rewrite AI content the doctor is already reading. Held
   *  until explicitly accepted. */
  | 'SUGGESTION_ONLY'
  /** NOT written. The radiologist owns this section. Held as a suggestion. */
  | 'CONFLICT_WITH_PHYSICIAN_EDIT'

export type LiveFlagCode =
  /** Machine-authored protocol template — the only text nobody dictated. */
  | 'autoFilled'
  /** The engine scored this section low. */
  | 'lowConfidence'
  /** The engine chose this conclusion positionally; the doctor never marked it. */
  | 'inferredConclusion'
  /** The proposal replaces rather than extends what is displayed. */
  | 'rewrite'
  /** Text appears to have moved between sections. */
  | 'sectionReassigned'
  /** A dictated correction the engine refused to localize (report-level). */
  | 'ambiguousCorrection'
  /** Raw vs cleaned transcript diverged heavily (report-level). */
  | 'cleanupDrift'
  /** The radiologist authored this section. */
  | 'physicianOwned'
  /** R2.6 — this clinical statement also appears in another section. */
  | 'duplicateContent'
  /** R2.6 — routed here by classification, not by a header the doctor dictated. */
  | 'sectionInferred'

export interface SectionSuggestion {
  key: SectionKey
  text: string
  reasons: LiveFlagCode[]
  /** Revision that produced it — a newer revision supersedes an older one. */
  revision: number
}

export interface SectionDecision {
  key: SectionKey
  classification: UpdateClass
  reasons: LiveFlagCode[]
  previousText: string
  proposedText: string
  /** True only when the text was actually written into the section. */
  applied: boolean
  /** R2.7C — who authored the proposed text, so the editor can persist it. */
  origin: SectionOrigin
}

export interface LiveCoordinatorState {
  /** Last revision STARTED. Monotonic, never reused. */
  revision: number
  /** Last revision RECONCILED. A result at or below this is stale. */
  appliedRevision: number
  /** Stable transcript of the last started revision (dedupe key). */
  submittedTranscript: string
  /** Stable transcript of the last reconciled revision. */
  processedTranscript: string
  /** R1 live state: sections, locks, provenance log. */
  report: LiveReportState
  suggestions: Partial<Record<SectionKey, SectionSuggestion>>
  flags: Partial<Record<SectionKey, LiveFlagCode[]>>
  /** Conditions that cannot honestly be attributed to a single section. */
  reportFlags: LiveFlagCode[]
  /** A finalized report accepts nothing. */
  frozen: boolean
}

// ─── Text comparison ──────────────────────────────────────────────────────────

/** Whitespace-insensitive, case-preserving. Used to decide "same text". */
function norm(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** Case-insensitive too — the parser re-capitalises as a section grows. */
function key(s: string): string {
  return norm(s).toLowerCase()
}

/**
 * Does `next` continue `prev` rather than replace it? An empty `prev` is
 * trivially extended: there is nothing to lose.
 */
export function isExtensionOf(next: string, prev: string): boolean {
  const p = key(prev)
  if (!p) return true
  return key(next).startsWith(p)
}

// ─── Construction ─────────────────────────────────────────────────────────────

export function createCoordinator(opts?: {
  /** Persisted report content, if this report already has some. Every non-empty
   *  section starts LOCKED: previously saved text was authored or reviewed by a
   *  human and live AI must not rewrite it. */
  base?: StructuredReportData | null
  frozen?: boolean
}): LiveCoordinatorState {
  const base = opts?.base ?? null
  return {
    revision: 0,
    appliedRevision: 0,
    submittedTranscript: '',
    processedTranscript: '',
    report: base ? fromStructuredReportData(base) : createLiveReportState(),
    suggestions: {},
    flags: {},
    reportFlags: [],
    frozen: Boolean(opts?.frozen),
  }
}

/** Stop all live activity — the report was finalized. */
export function freeze(state: LiveCoordinatorState): LiveCoordinatorState {
  return { ...state, frozen: true }
}

// ─── Revisions ────────────────────────────────────────────────────────────────

/**
 * Open a revision for a stable transcript.
 *
 * Returns `changed: false` when there is nothing new to do — a frozen report,
 * empty text, or a transcript identical to the one already submitted. That is
 * the §22 guard: the coordinator never reprocesses an unchanged transcript.
 *
 * `force` opens a revision regardless, for the single final pass at stop.
 */
export function beginRevision(
  state: LiveCoordinatorState,
  stableTranscript: string,
  opts?: { force?: boolean },
): { state: LiveCoordinatorState; revision: number; changed: boolean } {
  const text = norm(stableTranscript)
  const force = Boolean(opts?.force)

  if (state.frozen) return { state, revision: state.revision, changed: false }
  if (!text && !force) return { state, revision: state.revision, changed: false }
  if (!force && key(text) === key(state.submittedTranscript)) {
    return { state, revision: state.revision, changed: false }
  }

  const revision = state.revision + 1
  return { state: { ...state, revision, submittedTranscript: text }, revision, changed: true }
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Decide what may happen to one section. Pure and total.
 *
 * Order matters: ownership beats everything, then destructiveness, then flags.
 */
export function classifySectionUpdate(input: {
  previousText: string
  proposedText: string
  locked: boolean
  flags: LiveFlagCode[]
}): UpdateClass {
  const prev = norm(input.previousText)
  const next = norm(input.proposedText)

  if (prev === next) return 'NO_CHANGE'
  // A section is never blanked. R1 rule 2; restated here so the classification
  // is meaningful on its own.
  if (!next) return 'NO_CHANGE'

  if (input.locked) return 'CONFLICT_WITH_PHYSICIAN_EDIT'
  if (!isExtensionOf(next, prev)) return 'SUGGESTION_ONLY'
  if (input.flags.length > 0) return 'REVIEW_REQUIRED'
  return 'SAFE_AUTO_APPLY'
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

export interface ReconcileInput {
  /** The revision this result belongs to (from `beginRevision`). */
  revision: number
  /** The stable transcript it was produced from. */
  stableTranscript: string
  draft: StructuredReportData
  meta: HpdStructuringMeta
}

export type ReconcileOutcome = 'applied' | 'stale' | 'frozen'

export interface ReconcileResult {
  state: LiveCoordinatorState
  decisions: SectionDecision[]
  outcome: ReconcileOutcome
}

function proposedText(draft: StructuredReportData, k: SectionKey): string {
  switch (k) {
    case 'indication':      return draft.indication ?? ''
    case 'technique':       return draft.technique ?? ''
    case 'results':         return draft.results ?? ''
    case 'conclusion':      return draft.conclusion ?? ''
    case 'recommendations': return draft.recommendations ?? ''
  }
}

/**
 * Which sections look like they gave their text to another section this
 * revision? Detected structurally: a section's current text vanished from its
 * own proposal and turned up inside a different one.
 *
 * The 4-character floor keeps trivial fragments from generating noise. A false
 * positive costs a review flag, never a lost word.
 */
function detectReassignments(
  previous: SectionTextMap,
  proposed: SectionTextMap,
): Set<SectionKey> {
  const moved = new Set<SectionKey>()
  for (const from of SECTION_ORDER) {
    const was = key(previous[from])
    if (was.length < 4) continue
    if (key(proposed[from]).includes(was)) continue // still there
    for (const to of SECTION_ORDER) {
      if (to === from) continue
      if (key(proposed[to]).includes(was)) {
        moved.add(from)
        moved.add(to)
        break
      }
    }
  }
  return moved
}

/**
 * Reconcile one structuring result against the live report.
 *
 * Never throws. A stale or frozen result changes nothing at all.
 */
export function reconcile(
  state: LiveCoordinatorState,
  input: ReconcileInput,
): ReconcileResult {
  if (state.frozen) return { state, decisions: [], outcome: 'frozen' }
  if (input.revision <= state.appliedRevision) {
    return { state, decisions: [], outcome: 'stale' }
  }

  const { draft, meta } = input

  // Report-level conditions. Neither can be attributed to one section: a
  // CorrectionEvent carries a character offset into the RAW transcript, while
  // sections are sliced from the CLEANED one with no ranges to map between
  // them. Rather than guess a section, they are surfaced report-wide and they
  // hold every section in this revision back from silent auto-apply.
  const reportFlags: LiveFlagCode[] = []
  if (meta.correctionEvents.some((e) => e.applied === false)) reportFlags.push('ambiguousCorrection')
  if (meta.warnings.some((w) => w.type === 'heavy_cleanup_drift')) reportFlags.push('cleanupDrift')

  const previous = {} as SectionTextMap
  const proposed = {} as SectionTextMap
  for (const k of SECTION_ORDER) {
    previous[k] = state.report.sections[k].text
    proposed[k] = proposedText(draft, k)
  }

  const reassigned = detectReassignments(previous, proposed)

  const decisions: SectionDecision[] = []
  const writable: SectionPatch[] = []
  const suggestions = { ...state.suggestions }
  const flags = { ...state.flags }

  // R2.6 — sections whose clinical statement also appears somewhere else.
  const duplicated = new Set<SectionKey>()
  for (const d of meta.duplication ?? []) {
    duplicated.add(d.sections[0] as SectionKey)
    duplicated.add(d.sections[1] as SectionKey)
  }

  for (const k of SECTION_ORDER) {
    const score = meta.confidence.find((c) => c.section === k)
    const autoFilled = Boolean(score?.autoFilled)
    // R2.6 — the router says why this section holds what it holds, so the
    // coordinator no longer re-derives it by re-scanning the transcript.
    const routed = meta.provenance?.[k]

    const reasons: LiveFlagCode[] = [...reportFlags]
    if (autoFilled) reasons.push('autoFilled')
    else if (score?.reviewRequired && proposed[k].trim()) reasons.push('lowConfidence')

    if (proposed[k].trim() && (routed === 'inferred' || routed === 'continuation')) {
      reasons.push('sectionInferred')
    }
    if (
      k === 'conclusion' &&
      proposed[k].trim() &&
      (routed
        ? routed !== 'explicit_header'
        : !hasExplicitSectionHeader('conclusion', input.stableTranscript))
    ) {
      reasons.push('inferredConclusion')
    }
    if (duplicated.has(k)) reasons.push('duplicateContent')
    if (reassigned.has(k)) reasons.push('sectionReassigned')

    const locked = state.report.sections[k].locked
    if (locked) reasons.push('physicianOwned')

    const classification = classifySectionUpdate({
      previousText: previous[k],
      proposedText: proposed[k],
      locked,
      flags: reasons,
    })

    if (classification === 'SUGGESTION_ONLY' && !reasons.includes('rewrite')) {
      reasons.push('rewrite')
    }

    const applied = classification === 'SAFE_AUTO_APPLY' || classification === 'REVIEW_REQUIRED'
    const origin: SectionOrigin = autoFilled ? 'template' : 'dictation'

    if (applied) {
      writable.push({
        key: k,
        text: proposed[k],
        origin,
        confidence: score?.confidence,
        reviewRequired: reasons.length > 0,
        kind: meta.correctionEvents.length > 0 ? 'correction' : 'dictated',
      })
      delete suggestions[k]
      if (reasons.length > 0) flags[k] = reasons
      else delete flags[k]
    } else if (classification === 'NO_CHANGE') {
      // Leave existing flags and suggestions alone: nothing about this section
      // was resolved this revision.
    } else {
      // Held back. A newer revision always supersedes an older suggestion.
      suggestions[k] = { key: k, text: proposed[k], reasons, revision: input.revision }
      flags[k] = reasons
    }

    decisions.push({
      key: k,
      classification,
      reasons,
      previousText: previous[k],
      proposedText: proposed[k],
      applied,
      origin,
    })
  }

  // R1 does the writing and keeps the provenance log. It independently refuses
  // to blank a section or to overwrite a locked one, so a classification bug
  // here cannot silently destroy clinical text.
  const patch = applyStructuredPatch(state.report, {
    transcript: input.stableTranscript,
    sections: writable,
    corrections: meta.correctionEvents,
  })

  // Anything R1 withheld becomes a suggestion too (defence in depth).
  for (const s of patch.suggestions) {
    suggestions[s.key] = {
      key: s.key,
      text: s.text,
      reasons: flags[s.key] ?? ['physicianOwned'],
      revision: input.revision,
    }
  }

  return {
    state: {
      ...state,
      appliedRevision: input.revision,
      processedTranscript: norm(input.stableTranscript),
      report: patch.state,
      suggestions,
      flags,
      reportFlags,
    },
    decisions,
    outcome: 'applied',
  }
}

// ─── Radiologist actions ──────────────────────────────────────────────────────

/**
 * The doctor typed in a section. It becomes theirs: live AI may propose but
 * never write here again until they hand it back.
 */
export function markPhysicianEdit(
  state: LiveCoordinatorState,
  k: SectionKey,
  text: string,
): LiveCoordinatorState {
  const flags = { ...state.flags }
  // Their own words need no review flag.
  delete flags[k]
  return { ...state, report: markSectionEdited(state.report, k, text), flags }
}

/**
 * Adopt report content that arrived from outside the live loop — the doctor
 * pressed "Apply to report" on a server-side structuring run, or opened a
 * template. The live baseline becomes that content so the next revision diffs
 * against what the doctor is actually reading instead of stale text.
 *
 * Non-empty sections become physician-owned: this content was applied by a
 * human action, so live AI proposes rather than overwrites.
 */
export function adoptReportData(
  state: LiveCoordinatorState,
  data: StructuredReportData,
): LiveCoordinatorState {
  return {
    ...state,
    report: { ...fromStructuredReportData(data), log: state.report.log },
    suggestions: {},
    flags: {},
  }
}

/** Explicitly hand a section back to live AI (§15). */
export function resumeAiManagement(
  state: LiveCoordinatorState,
  k: SectionKey,
): LiveCoordinatorState {
  return { ...state, report: unlockSection(state.report, k) }
}

/**
 * Accept a held suggestion. The text is written; the section keeps whoever owns
 * it — accepting a suggestion is not the same as giving the section back to AI.
 */
export function acceptSuggestion(
  state: LiveCoordinatorState,
  k: SectionKey,
): LiveCoordinatorState {
  const s = state.suggestions[k]
  if (!s || state.frozen) return state

  const sections = {
    ...state.report.sections,
    [k]: { ...state.report.sections[k], text: s.text, reviewRequired: false },
  }
  const suggestions = { ...state.suggestions }
  delete suggestions[k]
  const flags = { ...state.flags }
  delete flags[k]

  return {
    ...state,
    report: {
      ...state.report,
      sections,
      log: [
        ...state.report.log,
        {
          key: k,
          outcome: 'applied',
          kind: 'dictated',
          previousText: state.report.sections[k].text,
          nextText: s.text,
        },
      ],
    },
    suggestions,
    flags,
  }
}

export function rejectSuggestion(
  state: LiveCoordinatorState,
  k: SectionKey,
): LiveCoordinatorState {
  const suggestions = { ...state.suggestions }
  delete suggestions[k]
  const flags = { ...state.flags }
  delete flags[k]
  return { ...state, suggestions, flags }
}

// ─── Projection ───────────────────────────────────────────────────────────────

/** Current section text, for rendering. */
export function liveSections(state: LiveCoordinatorState): SectionTextMap {
  return SECTION_ORDER.reduce((acc, k) => {
    acc[k] = state.report.sections[k].text
    return acc
  }, {} as SectionTextMap)
}

/** Sections the radiologist owns — live AI is paused for these. */
export function physicianOwnedSections(state: LiveCoordinatorState): SectionKey[] {
  return SECTION_ORDER.filter((k) => state.report.sections[k].locked)
}

/** True while any section still carries an unresolved live review flag. */
export function hasOpenReviewFlags(state: LiveCoordinatorState): boolean {
  return SECTION_ORDER.some((k) => (state.flags[k]?.length ?? 0) > 0)
}

/**
 * Project into the SAME canonical model the editor, save, PDF, DOCX, print and
 * signed report already use. There is no second report model.
 */
export function toReportData(
  state: LiveCoordinatorState,
  base: StructuredReportData,
): StructuredReportData {
  return toStructuredReportData(state.report, base)
}
