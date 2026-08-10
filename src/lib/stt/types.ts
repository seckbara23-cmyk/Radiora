// R2.7A — the speech-to-text boundary.
//
// STT and clinical structuring are DIFFERENT LAYERS and this file is the seam
// between them:
//
//   STT answers      "what words were spoken?"
//   Radiora answers  "which section of the report do those words belong in?"
//
// Everything provider-specific stops here. No provider SDK type, no vendor
// response shape and no API key ever crosses this boundary — downstream code
// sees a `SpeechToTextResult` and nothing else. That is what keeps the promise
// that swapping providers cannot change clinical behaviour.
//
// STT NEVER writes a report section. It produces raw text, that text is
// persisted as provenance, and the existing canonical `runStructuring` pipeline
// decides everything clinical afterwards.

/** Safe internal failure categories. A raw provider body never reaches the UI. */
export type SttErrorCode =
  /** No provider configured, or configuration is invalid. Fails closed. */
  | 'not_configured'
  /** Credentials rejected by the provider. */
  | 'auth'
  /** Provider unreachable or returned a server error. */
  | 'unavailable'
  /** Provider did not answer inside the configured budget. */
  | 'timeout'
  /** Provider asked us to slow down. */
  | 'rate_limited'
  /** The audio format is not one the provider accepts. */
  | 'unsupported_audio'
  /** The audio is empty or unreadable. */
  | 'empty_audio'
  /** The audio exceeds the provider or platform limit. */
  | 'too_large'
  /** The provider answered, but with nothing usable. */
  | 'empty_transcript'
  /** The provider answered in a shape this adapter does not understand. */
  | 'malformed_response'
  | 'unknown'

export class SttError extends Error {
  constructor(
    readonly code: SttErrorCode,
    /** Operational detail for logs. NEVER a provider body, key or clinical text. */
    message: string,
  ) {
    super(message)
    this.name = 'SttError'
  }
}

export interface SpeechToTextInput {
  /** The audio itself. Nothing else about the patient or the report travels. */
  audio: Blob
  /** Container/codec as recorded, e.g. `audio/webm`, `audio/mp4`. */
  mimeType: string
  /** Some providers key format detection off the extension. */
  filename: string
  /** BCP-47 hint, e.g. `fr`. Radiora is French-first. */
  language?: string
  /**
   * Bounded terminology hint, when the provider supports one. Radiology
   * vocabulary only — never a previous report, never patient data.
   */
  vocabularyHint?: string
}

export interface SpeechToTextResult {
  /** The transcript exactly as the provider returned it. Never cleaned here. */
  text: string
  /** Detected or echoed language, when the provider reports one. */
  language?: string
  /** Audio duration in seconds, when the provider reports one. */
  durationSeconds?: number
  /** Only when the provider genuinely supplies one — never fabricated. */
  confidence?: number
  provider: string
  model: string
  /** Non-fatal notes worth surfacing to operations. */
  warnings?: string[]
}

export interface SpeechToTextProvider {
  readonly name: string
  readonly model: string
  transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult>
}

/** Formats the phone and the import path can actually produce. */
export const STT_SUPPORTED_MIME = [
  'audio/webm',        // Android / Chrome MediaRecorder
  'audio/ogg',         // Firefox MediaRecorder
  'audio/mp4',         // iOS / Safari MediaRecorder
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',        // imported mp3
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'video/mp4',         // Safari labels its audio-only mp4 this way
] as const

/**
 * Is this something we are willing to send?
 *
 * `application/octet-stream` is deliberately NOT accepted on its own: a generic
 * type tells the provider nothing, and guessing the container for a clinical
 * recording is how a silent mis-transcription starts. The caller resolves the
 * real type from the stored extension first.
 */
export function isSupportedSttMime(mime: string | null | undefined): boolean {
  if (!mime) return false
  const base = mime.split(';')[0].trim().toLowerCase()
  return (STT_SUPPORTED_MIME as readonly string[]).includes(base)
}

/** Best-effort MIME for a stored path, used when the column is generic. */
export function mimeForAudioExtension(ext: string): string | null {
  switch (ext.toLowerCase()) {
    case 'webm': return 'audio/webm'
    case 'ogg':  return 'audio/ogg'
    case 'mp4':  return 'audio/mp4'
    case 'm4a':  return 'audio/m4a'
    case 'mp3':  return 'audio/mpeg'
    case 'wav':  return 'audio/wav'
    default:     return null
  }
}
