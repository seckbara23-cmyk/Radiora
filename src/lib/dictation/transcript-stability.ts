// R2.4 — the stable live transcript boundary.
//
// The R1 audit proved runStructuring is NON-MONOTONIC on partial transcripts: a
// dictated retraction whose replacement has not been spoken yet empties the
// report, and an inline marker prints as clinical text until its replacement
// arrives. Interim browser speech therefore can never be treated as clinical
// content.
//
// This module separates three things the product must not conflate:
//
//   INTERIM      what the browser is guessing right now. Displayed, never
//                committed, never structured.
//   STABLE       finalized speech that passed the guards below. Append-only.
//   CANONICAL    the ordered concatenation of committed segments — the text
//                that gets persisted and is the ONLY input eligible for
//                structuring.
//
// The rule everywhere is FAIL CONSERVATIVE: when in doubt, keep it interim.
// Text that stays interim costs the doctor a moment; text that is committed
// wrongly corrupts a clinical record.
//
// Pure — no DOM, no clock, no IO. Timestamps are injected by the caller.

import type { DictationMethod } from '@/lib/reports/workspace-state'

export interface TranscriptSegment {
  /** Deterministic: derived from the sequence, never random. */
  id: string
  sequence: number
  text: string
  /** ISO timestamp supplied by the caller (this module has no clock). */
  committedAt: string
  source: DictationMethod
  /** Character range within the canonical transcript. */
  start: number
  end: number
  /** Recognition confidence when the engine reports one. */
  confidence?: number
}

export interface TranscriptState {
  segments: TranscriptSegment[]
  /** Current interim guess. Never persisted, never structured. */
  interim: string
}

export function emptyTranscriptState(): TranscriptState {
  return { segments: [], interim: '' }
}

// ─── Stability guards ─────────────────────────────────────────────────────────
// Each answers: "would committing here risk freezing an unfinished clinical
// statement?" A true answer keeps the text interim.

/** A dictated correction whose replacement has not arrived yet. */
// The bare "non" alternative is END-ANCHORED on purpose: it matches a
// standalone retraction (". Non.") but never the adjectival use that is
// everywhere in radiology ("non compliqué", "non spécifique"), because those
// have words after them.
const CORRECTION_PREFIX =
  /(?:^|[.!?;,]\s*)(?:je\s+corrige|je\s+me\s+corrige|je\s+reprends|correction|rectification|non\s*,?\s*plut[oô]t|ou\s+plut[oô]t|remplacez?(?:\s+par)?|remplacer(?:\s+par)?|supprimez?|erreur|pardon|non)\s*[.!?]?\s*$/i

export function endsWithCorrectionPrefix(text: string): boolean {
  return CORRECTION_PREFIX.test(text ?? '')
}

/**
 * A measurement still being spoken: a trailing number, a number followed by a
 * decimal separator, or the start of a unit word. "12.", "12 virgule",
 * "3 point", "14 millim" must never freeze — the value would be wrong.
 */
const INCOMPLETE_MEASUREMENT =
  /(?:\d+\s*(?:[.,]|point|virgule|comma)\s*$)|(?:\d+\s*$)|(?:\d+\s*(?:m|mm|c|cm|mi|mil|milli|millim|millimè|millimet|centi|centim|centimè)\s*$)/i

export function endsWithIncompleteMeasurement(text: string): boolean {
  return INCOMPLETE_MEASUREMENT.test((text ?? '').trimEnd())
}

/**
 * A negation whose object has not been spoken. Committing "Pas de." as a
 * sentence would assert a finding the doctor never made.
 */
const INCOMPLETE_NEGATION =
  /\b(?:pas\s+d[eu']?|pas\s+d'|absence\s+d[eu']?|absence\s+d'|sans|aucun[e]?|ni)\s*[.!?]?\s*$/i

export function endsWithIncompleteNegation(text: string): boolean {
  return INCOMPLETE_NEGATION.test((text ?? '').trimEnd())
}

/**
 * A localisation phrase still being spoken. Laterality is never inferred and
 * never carried from a template, so an unfinished one must stay interim.
 */
const INCOMPLETE_LATERALITY =
  /\b(?:du|de\s+la|de\s+l'|au|à\s+la|lobe|segment|c[oô]t[ée]|face|bord|region|région|niveau)\s*[.!?]?\s*$/i

export function endsWithIncompleteLaterality(text: string): boolean {
  return INCOMPLETE_LATERALITY.test((text ?? '').trimEnd())
}

/** Any guard tripped → not safe to freeze. */
export function isUnstableTail(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  return (
    endsWithCorrectionPrefix(t) ||
    endsWithIncompleteMeasurement(t) ||
    endsWithIncompleteNegation(t) ||
    endsWithIncompleteLaterality(t)
  )
}

// ─── The boundary ─────────────────────────────────────────────────────────────

function isDigit(ch: string | undefined): boolean {
  return !!ch && ch >= '0' && ch <= '9'
}

/**
 * Split a growing transcript into the part that is safe to freeze and the tail
 * that is not.
 *
 * Stability is NOT a timer. A boundary must be a real sentence terminator, and
 * the text before it must survive every guard above.
 */
export function stableBoundary(transcript: string): { stable: string; tail: string } {
  const text = transcript ?? ''
  if (!text.trim()) return { stable: '', tail: text }

  let boundary = -1
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\n') continue

    // A '.' between digits is a decimal separator: "3.5 cm" is one value.
    if (ch === '.' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue

    // A '.' right after a digit with nothing yet after it is ambiguous — it may
    // be the start of "12.5". Wait for the next token rather than freezing "12."
    if (ch === '.' && isDigit(text[i - 1]) && !text.slice(i + 1).trim()) continue

    boundary = i
    break
  }

  if (boundary < 0) return { stable: '', tail: text }

  let stable = text.slice(0, boundary + 1)
  let tail = text.slice(boundary + 1)

  // Walk the boundary backwards while the would-be stable text ends in an
  // unfinished clinical statement (a dangling "Je corrige.", "Pas de.", …).
  // Everything pulled back rejoins the interim tail.
  let guard = 0
  while (stable && isUnstableTail(stable) && guard++ < 8) {
    const prev = findPreviousBoundary(stable)
    if (prev < 0) { tail = stable + tail; stable = ''; break }
    tail = stable.slice(prev + 1) + tail
    stable = stable.slice(0, prev + 1)
  }

  return { stable: stable.trim(), tail }
}

function findPreviousBoundary(text: string): number {
  for (let i = text.length - 2; i >= 0; i--) {
    const ch = text[i]
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\n') continue
    if (ch === '.' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue
    return i
  }
  return -1
}

// ─── Committing segments ──────────────────────────────────────────────────────

export function canonicalTranscript(state: TranscriptState): string {
  return state.segments.map((s) => s.text).join(' ').trim()
}

/** Everything the doctor has said, committed plus the current guess. */
export function rawTranscript(state: TranscriptState): string {
  const canonical = canonicalTranscript(state)
  const interim = (state.interim ?? '').trim()
  if (!interim) return canonical
  return canonical ? `${canonical} ${interim}` : interim
}

/**
 * The ONLY text eligible for structuring. Interim is excluded by construction —
 * this is the seam R2.5 will consume, so the transcript model does not need to
 * be redesigned again.
 */
export function structuringInput(state: TranscriptState): string {
  return canonicalTranscript(state)
}

export interface CommitOptions {
  source: DictationMethod
  /** ISO timestamp — injected, so this module stays pure. */
  now: string
  confidence?: number
}

/**
 * Fold the recogniser's CUMULATIVE finalized text into the state.
 *
 * The browser re-delivers finalized results and can repeat or reorder
 * callbacks, so this diffs against what is already committed and appends only
 * genuinely new text. Committed segments are never rewritten or removed —
 * on divergence (a restart, a reordered index) the existing record wins and
 * only the unseen remainder is considered.
 */
export function commitFinalized(
  state: TranscriptState,
  cumulativeFinalText: string,
  opts: CommitOptions,
): TranscriptState {
  const incoming = (cumulativeFinalText ?? '').trim()
  const committed = canonicalTranscript(state)

  if (!incoming) return state

  let delta: string
  if (!committed) {
    delta = incoming
  } else if (incoming.startsWith(committed)) {
    delta = incoming.slice(committed.length)
  } else {
    // Divergence: keep everything already committed and take only what extends
    // beyond the longest common prefix. Never delete a committed segment.
    const common = longestCommonPrefix(committed, incoming)
    delta = incoming.length > common.length ? incoming.slice(common.length) : ''
  }

  if (!delta.trim()) return state

  const { stable } = stableBoundary(delta)
  if (!stable) return state

  return appendSegment(state, stable, opts)
}

function longestCommonPrefix(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return a.slice(0, i)
}

/**
 * Append one committed segment. Deterministic identity from the sequence —
 * no randomness, so the same dictation always yields the same segment ids.
 */
export function appendSegment(
  state: TranscriptState,
  text: string,
  opts: CommitOptions,
): TranscriptState {
  const value = (text ?? '').trim()
  if (!value) return state

  // Exact-duplicate guard for a repeated final callback.
  const last = state.segments[state.segments.length - 1]
  if (last && last.text === value) return state

  const sequence = state.segments.length + 1
  const base = canonicalTranscript(state)
  const start = base ? base.length + 1 : 0

  const segment: TranscriptSegment = {
    id: `seg-${sequence}`,
    sequence,
    text: value,
    committedAt: opts.now,
    source: opts.source,
    start,
    end: start + value.length,
    ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}),
  }

  return { ...state, segments: [...state.segments, segment] }
}

/** Replace the interim guess. Never touches committed segments. */
export function setInterim(state: TranscriptState, interim: string): TranscriptState {
  return { ...state, interim: interim ?? '' }
}

/**
 * Commit a COMPLETE transcript that did not arrive as a live stream — a phone
 * recording or an imported file, which have no interim phase. Represented as
 * committed segment(s) so every source shares one transcript model.
 */
export function commitCompleteTranscript(
  state: TranscriptState,
  text: string,
  opts: CommitOptions,
): TranscriptState {
  const value = (text ?? '').trim()
  if (!value) return state
  // Already complete by definition — no stability guard applies.
  return { ...appendSegment(state, value, opts), interim: '' }
}

/**
 * Flush at stop: whatever is still interim is offered as a final segment.
 * The guards still apply, so a dangling correction is NOT frozen — the caller
 * receives `pending` and can keep or discard it deliberately.
 */
export function finalizeRecording(
  state: TranscriptState,
  opts: CommitOptions,
): { state: TranscriptState; pending: string } {
  const interim = (state.interim ?? '').trim()
  if (!interim) return { state, pending: '' }

  const { stable, tail } = stableBoundary(interim)
  const next = stable ? appendSegment(state, stable, opts) : state
  return { state: { ...next, interim: '' }, pending: tail.trim() }
}
