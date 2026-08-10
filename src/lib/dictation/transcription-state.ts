// R2.7A — the transcription lifecycle as the doctor experiences it, plus the
// rule for combining multiple dictation passes.
//
// Pure: no IO, no clock, no React. Both rules here are ones a clinical reviewer
// should be able to check by reading, not by running the app.

/** Where the newest recording for a report has got to. */
export type TranscriptionStage =
  /** No recording attached yet. */
  | 'none'
  /** Audio is attached, transcription has not started. */
  | 'pending'
  /** A worker owns it right now. */
  | 'transcribing'
  /** Text is available and is part of the canonical transcript. */
  | 'completed'
  /** The attempt failed; an explicit retry is offered. */
  | 'failed'

/** Map a `transcription_runs.status` value onto the doctor-facing stage. */
export function transcriptionStage(runStatus: string | null | undefined): TranscriptionStage {
  switch (runStatus) {
    case 'processing': return 'transcribing'
    case 'completed':  return 'completed'
    case 'failed':     return 'failed'
    default:           return 'pending'
  }
}

/** Stages where something is happening and the desktop should keep looking. */
export function isTranscriptionBusy(stage: TranscriptionStage): boolean {
  return stage === 'transcribing'
}

/** A failed stage is the only one that offers a retry. */
export function canRetryTranscription(stage: TranscriptionStage): boolean {
  return stage === 'failed'
}

/**
 * Combine a newly transcribed pass with what the report already had.
 *
 * A report may be dictated several times (R2.7 supports multiple phone
 * sessions). Earlier text is NEVER destroyed and audio files are never merged:
 * each pass keeps its own `transcription_runs` row with its own audio asset,
 * and the canonical transcript is the passes in order, separated by a blank
 * line so the doctor can see where one dictation ended and the next began.
 *
 * The combined text is then structured as ONE complete transcript, which is
 * exactly what R2.5/R2.6 already expect — the engine is a function of a whole
 * transcript, so re-running it over everything is the safe reconciliation.
 *
 * An exactly-repeated pass is not appended twice: a re-delivered completion
 * must not double the report's findings.
 */
/**
 * R2.7C — what the IMMUTABLE source transcript becomes when the workspace saves.
 *
 * `transcriptions.raw_text` is evidence: it is what the provider (or the
 * browser recogniser) actually produced, and it is what a later reader relies
 * on to check that the report says what the doctor said. The workspace shows
 * that text in an EDITABLE box, and before R2.7C saving simply wrote the box
 * back over `raw_text` — so the "original dictation" guarantee held only
 * because nobody had edited it yet.
 *
 * `corrected_text` is the working copy and takes every edit. This function
 * decides the source, and it only ever moves in one direction:
 *
 *   • nothing stored yet   → the incoming text IS the first capture;
 *   • incoming EXTENDS it  → continued dictation, so the source grows;
 *   • anything else        → an edit. The source is left exactly as it was.
 *
 * Whitespace-insensitive but case- and word-sensitive: a looser comparison
 * would classify a genuine edit as continued dictation and overwrite evidence,
 * which is the one direction this must not fail in.
 */
export function nextSourceTranscript(stored: string, incoming: string): string {
  const previous = (stored ?? '').trim()
  const next = (incoming ?? '').trim()
  if (!previous) return next
  if (!next) return previous
  const flat = (s: string) => s.replace(/\s+/g, ' ')
  return flat(next).startsWith(flat(previous)) ? next : previous
}

export function appendTranscriptPass(existing: string, next: string): string {
  const previous = (existing ?? '').trim()
  const addition = (next ?? '').trim()
  if (!addition) return previous
  if (!previous) return addition
  if (previous === addition) return previous
  if (previous.endsWith(addition)) return previous
  return `${previous}\n\n${addition}`
}
