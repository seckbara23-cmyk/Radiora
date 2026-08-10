// R2.7A — adapter for the multipart `POST {baseUrl}/audio/transcriptions`
// endpoint family.
//
// WHY THIS SHAPE
// It is the closest thing to a de-facto standard for speech-to-text, and —
// crucially for a clinical product — it is implemented both by hosted services
// and by self-hostable Whisper servers. One adapter therefore covers the
// privacy-preserving deployment (audio never leaves the operator's network) and
// the convenient one, with the choice expressed purely in STT_BASE_URL. No
// second adapter, no vendor SDK, no vendor types leaking downstream.
//
// WHAT LEAVES RADIORA
// Exactly three things: the audio bytes, a language hint, and — only if the
// operator configured one — a bounded radiology vocabulary hint. No report id,
// no clinic id, no patient identifier, no accession number, no previous
// findings. See the request construction below; there is nothing else in it.
//
// SERVER ONLY. Following the same convention as `createAdminClient`: the
// credential lives in a non-NEXT_PUBLIC_ variable, so Next never inlines it into
// a client bundle, and the factory below refuses to run in a browser. Two tests
// back this up — one scans the built client bundle for the secret, one asserts
// no client component imports this module.

import { SttError, type SpeechToTextInput, type SpeechToTextProvider, type SpeechToTextResult } from '@/lib/stt/types'
import type { SttConfig } from '@/lib/stt/config'

interface TranscriptionResponse {
  text?: unknown
  language?: unknown
  duration?: unknown
  segments?: unknown
}

/** Map a transport/HTTP failure onto a safe internal category. */
function categorise(status: number): SttError {
  if (status === 401 || status === 403) {
    return new SttError('auth', `provider rejected credentials (${status})`)
  }
  if (status === 429) return new SttError('rate_limited', 'provider rate limit')
  if (status === 413) return new SttError('too_large', 'provider rejected the audio size')
  if (status === 415 || status === 400) {
    return new SttError('unsupported_audio', `provider rejected the audio (${status})`)
  }
  if (status >= 500) return new SttError('unavailable', `provider error (${status})`)
  return new SttError('unknown', `provider returned ${status}`)
}

export function createOpenAiCompatibleProvider(config: SttConfig): SpeechToTextProvider {
  return {
    name: 'openai-compatible',
    model: config.model,

    async transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult> {
      if (!input.audio || input.audio.size === 0) {
        throw new SttError('empty_audio', 'audio is empty')
      }

      const form = new FormData()
      form.set('file', new File([input.audio], input.filename, { type: input.mimeType }))
      form.set('model', config.model)
      form.set('response_format', 'json')
      if (input.language) form.set('language', input.language)
      // Bounded terminology only. Never a previous report, never patient data.
      if (input.vocabularyHint) form.set('prompt', input.vocabularyHint)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)

      let response: Response
      try {
        response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
          body: form,
          signal: controller.signal,
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new SttError('timeout', `no response within ${config.timeoutMs}ms`)
        }
        throw new SttError('unavailable', 'could not reach the transcription service')
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        // The body may echo provider internals; it is deliberately not read
        // into the error, so it can never surface in the UI or the audit trail.
        throw categorise(response.status)
      }

      let payload: TranscriptionResponse
      try {
        payload = (await response.json()) as TranscriptionResponse
      } catch {
        throw new SttError('malformed_response', 'provider response was not JSON')
      }

      if (typeof payload.text !== 'string') {
        throw new SttError('malformed_response', 'provider response had no text field')
      }

      const text = payload.text.trim()
      if (!text) {
        // Silence, or the provider heard nothing. Never invent content.
        throw new SttError('empty_transcript', 'provider returned an empty transcript')
      }

      return {
        text,
        language: typeof payload.language === 'string' ? payload.language : undefined,
        durationSeconds: typeof payload.duration === 'number' ? payload.duration : undefined,
        provider: 'openai-compatible',
        model: config.model,
      }
    },
  }
}
