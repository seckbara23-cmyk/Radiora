// F14 — multi-patient dictation segmentation.
//
// PURE and deterministic: one recording often holds several patients dictated
// back-to-back, separated by spoken cues ("patient suivant", "nouveau patient",
// "numéro d'examen", "nom du patient", …). This splits the transcript at those
// cues into ordered per-patient segments. It ONLY slices the text — it never
// rewrites, summarizes or invents any clinical content. The radiologist remains
// in control of routing each segment to its own report.

export type SeparatorKind = 'delimiter' | 'introducer'

interface SeparatorDef {
  // Source matches the original (accented) transcript; accents/apostrophes are
  // made optional so messy ASR output still triggers.
  source: string
  kind: SeparatorKind
  label: string
}

// 'delimiter'  → a pure boundary cue, dropped from the segment text.
// 'introducer' → introduces data that follows (a name / number), so the cue is
//                kept at the start of the new segment and feeds the hint.
const SEPARATORS: SeparatorDef[] = [
  { source: "nom\\s+d(?:u|e\\s+la)\\s+patient(?:e)?",   kind: 'introducer', label: 'nom du patient' },
  { source: "num[ée]ro\\s+d['’\\s]?examen",             kind: 'introducer', label: "numéro d'examen" },
  { source: "patient(?:e)?\\s+suivant(?:e)?",           kind: 'delimiter',  label: 'patient suivant' },
  { source: "nouve(?:au|lle)\\s+patient(?:e)?",         kind: 'delimiter',  label: 'nouveau patient' },
  { source: "prochain(?:e)?\\s+patient(?:e)?",          kind: 'delimiter',  label: 'prochain patient' },
  { source: "(?:examen\\s+suivant|prochain\\s+examen)", kind: 'delimiter',  label: 'examen suivant' },
]

export const SEGMENT_SEPARATOR_LABELS: readonly string[] = SEPARATORS.map((s) => s.label)

const COMBINED = new RegExp(SEPARATORS.map((s) => `(${s.source})`).join('|'), 'giu')

export interface DictationSegment {
  /** 1-based patient number in dictation order. */
  index: number
  /** The cue phrase that opened this segment, or null for the first one. */
  separator: string | null
  /** The segment's verbatim text (cue dropped for delimiters, kept for introducers). */
  text: string
  /** Best-effort label (name or exam number) parsed from an introducer cue; '' otherwise. */
  hint: string
}

interface Boundary {
  start: number
  end: number
  kind: SeparatorKind
  label: string
}

function findBoundaries(transcript: string): Boundary[] {
  const out: Boundary[] = []
  COMBINED.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = COMBINED.exec(transcript)) !== null) {
    // Identify which alternative matched (group i+1 is defined).
    let defIndex = 0
    for (let i = 0; i < SEPARATORS.length; i++) {
      if (m[i + 1] !== undefined) {
        defIndex = i
        break
      }
    }
    const def = SEPARATORS[defIndex]
    out.push({ start: m.index, end: m.index + m[0].length, kind: def.kind, label: def.label })
    // Guard against zero-width matches looping forever.
    if (COMBINED.lastIndex === m.index) COMBINED.lastIndex++
  }
  return out
}

// Keep the hint short: the first clause after an introducer cue (a name or number).
function extractHint(raw: string): string {
  const firstClause = raw.split(/[.\n,;]/)[0] ?? ''
  return firstClause.replace(/\s+/g, ' ').trim().slice(0, 60)
}

/**
 * Split a dictation transcript into ordered per-patient segments.
 * Returns a single segment when no separator cue is present, and [] for empty input.
 */
export function splitDictationSegments(transcript: string): DictationSegment[] {
  const text = transcript ?? ''
  if (!text.trim()) return []

  const boundaries = findBoundaries(text)
  if (boundaries.length === 0) {
    return [{ index: 1, separator: null, text: text.trim(), hint: '' }]
  }

  const segments: DictationSegment[] = []
  const pushSegment = (separator: string | null, body: string, kind: SeparatorKind | null) => {
    // Strip punctuation/whitespace the cue left dangling at the front (e.g. ". B.").
    const trimmed = body.trim().replace(/^[\s.,;:!?'’«»()-]+/u, '').trim()
    // Skip chunks with no real content (e.g. a lone "." left between back-to-back cues).
    if (!/[\p{L}\p{N}]/u.test(trimmed)) return
    const hint = kind === 'introducer' ? extractHint(stripLeadingCue(trimmed, separator)) : ''
    segments.push({ index: segments.length + 1, separator, text: trimmed, hint })
  }

  // Leading chunk before the first cue (a patient dictated without an opening cue).
  pushSegment(null, text.slice(0, boundaries[0].start), null)

  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i]
    const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].start : text.length
    // Introducers keep their cue (the data follows it); delimiters drop it.
    const contentStart = b.kind === 'introducer' ? b.start : b.end
    pushSegment(b.label, text.slice(contentStart, nextStart), b.kind)
  }

  // Renumber defensively in case a leading/empty chunk was skipped.
  return segments.map((s, i) => ({ ...s, index: i + 1 }))
}

// Remove the matched cue from the front of an introducer segment so the hint is
// just the name/number that followed it.
function stripLeadingCue(segmentText: string, label: string | null): string {
  if (!label) return segmentText
  const def = SEPARATORS.find((s) => s.label === label)
  if (!def) return segmentText
  const lead = new RegExp(`^(?:${def.source})[\\s:'’-]*`, 'iu')
  return segmentText.replace(lead, '')
}

/** True when the transcript appears to contain more than one patient. */
export function hasMultiplePatients(transcript: string): boolean {
  return splitDictationSegments(transcript).length > 1
}
