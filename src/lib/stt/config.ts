// R2.7A — speech-to-text configuration. Server-only, fail-closed.
//
// Radiora shipped everything before R2.7A with NO external model of any kind:
// structuring is local and deterministic, which is what let its safety
// invariants be proven rather than hoped for. Speech-to-text is the first
// capability that can send data outside the tenant, so the configuration
// boundary is deliberately strict:
//
//   • Nothing is transcribed unless an operator has explicitly configured a
//     provider. There is no default endpoint and no built-in key.
//   • There is NO mock or fake transcription fallback. An unconfigured or
//     invalid setup returns `not_configured` and the doctor is told the feature
//     is unavailable — it never silently produces text nobody said.
//   • Whether audio leaves Radiora's infrastructure is entirely the operator's
//     choice, expressed in STT_BASE_URL. Pointing it at a self-hosted Whisper
//     server keeps audio inside their own network; pointing it at a hosted
//     vendor does not. This module cannot and does not decide that for them.
//
// `parseSttConfig` takes the environment as an argument so the rules are
// testable without touching process.env.

export interface SttConfig {
  provider: 'openai-compatible'
  model: string
  apiKey: string
  baseUrl: string
  timeoutMs: number
  language: string
}

export type SttConfigResult =
  | { ok: true; config: SttConfig }
  | { ok: false; reason: string }

/**
 * The only provider family this adapter speaks: the multipart
 * `POST {baseUrl}/audio/transcriptions` shape.
 *
 * It is deliberately a FAMILY rather than one vendor. The same request works
 * against a self-hosted Whisper server and against hosted services that
 * implement the same endpoint, so the privacy-preserving option is reachable
 * without a second adapter.
 */
export const SUPPORTED_STT_PROVIDERS = ['openai-compatible'] as const

const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 600_000
const DEFAULT_TIMEOUT_MS = 120_000

export type EnvLike = Record<string, string | undefined>

export function parseSttConfig(env: EnvLike): SttConfigResult {
  const provider = (env.STT_PROVIDER ?? '').trim()
  if (!provider) {
    return { ok: false, reason: 'STT_PROVIDER is not set' }
  }
  if (!(SUPPORTED_STT_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, reason: `STT_PROVIDER "${provider}" is not supported` }
  }

  const model = (env.STT_MODEL ?? '').trim()
  if (!model) return { ok: false, reason: 'STT_MODEL is not set' }

  const baseUrlRaw = (env.STT_BASE_URL ?? '').trim()
  if (!baseUrlRaw) return { ok: false, reason: 'STT_BASE_URL is not set' }

  let baseUrl: string
  try {
    const parsed = new URL(baseUrlRaw)
    // A plaintext endpoint would put clinical audio on the wire unencrypted.
    // Loopback is allowed so a self-hosted server can be developed against.
    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !isLoopback) {
      return { ok: false, reason: 'STT_BASE_URL must use https (except on localhost)' }
    }
    baseUrl = parsed.toString().replace(/\/+$/, '')
  } catch {
    return { ok: false, reason: 'STT_BASE_URL is not a valid URL' }
  }

  // A self-hosted server may legitimately need no credential; a remote one must
  // have one, otherwise a misconfiguration would send audio to an open endpoint.
  const apiKey = (env.STT_API_KEY ?? '').trim()
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl)
  if (!apiKey && !isLocal) {
    return { ok: false, reason: 'STT_API_KEY is required for a remote STT_BASE_URL' }
  }

  const timeoutRaw = (env.STT_TIMEOUT_MS ?? '').trim()
  let timeoutMs = DEFAULT_TIMEOUT_MS
  if (timeoutRaw) {
    const parsed = Number(timeoutRaw)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return { ok: false, reason: 'STT_TIMEOUT_MS must be an integer' }
    }
    if (parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
      return {
        ok: false,
        reason: `STT_TIMEOUT_MS must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
      }
    }
    timeoutMs = parsed
  }

  const language = (env.STT_LANGUAGE ?? 'fr').trim() || 'fr'

  return {
    ok: true,
    config: { provider: 'openai-compatible', model, apiKey, baseUrl, timeoutMs, language },
  }
}

/** True when transcription is available at all. Used to shape the UI honestly. */
export function isSttConfigured(env: EnvLike): boolean {
  return parseSttConfig(env).ok
}
