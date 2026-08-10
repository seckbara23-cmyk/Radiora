// R2.7C — the activation diagnostic.
//
// Answers one operational question — "can this installation transcribe?" —
// without touching a patient, a report or a recording.
//
// WHAT IT WILL NOT DO
//   • send audio, or any clinical text, anywhere
//   • send a patient, report, clinic or accession identifier
//   • write a transcription, create an audio asset or mutate a report
//   • return the API key, or any part of it, to any caller
//   • perform a real transcription in order to "prove" reachability
//
// Reachability is probed with `GET {baseUrl}/models`, the model-listing
// endpoint of the OpenAI-compatible family. It carries no payload at all, so
// there is nothing to leak — and it distinguishes "endpoint is up but the
// credential is wrong" from "endpoint is unreachable", which a transcription
// call could only tell us by sending something.
//
// SERVER ONLY. Reads STT_* directly; none are NEXT_PUBLIC_.

import { parseSttConfig, type EnvLike } from '@/lib/stt/config'

export type SttHealthState =
  /** No STT_* configuration at all. Transcription is off by design. */
  | 'UNCONFIGURED'
  /** Configuration present but rejected — see `detail`. Fails closed. */
  | 'INVALID_CONFIGURATION'
  /** Configuration valid; the endpoint answered. */
  | 'REACHABLE'
  /** Configuration valid; the endpoint did not answer usably. */
  | 'UNREACHABLE'

export interface SttHealth {
  state: SttHealthState
  /** Operational detail. Never a credential, never a provider body. */
  detail: string
  /** Safe, non-secret facts an operator needs to confirm the right target. */
  provider?: string
  model?: string
  /** Host only — never the full URL, never query or credentials. */
  endpointHost?: string
  /** Whether a credential is configured. NEVER the credential. */
  hasApiKey?: boolean
  language?: string
  timeoutMs?: number
  /** True when the configured model appears in the endpoint's model list. */
  modelAvailable?: boolean
  /** Round trip for the probe, when one was made. */
  latencyMs?: number
}

/** Probe budget. Deliberately short: this is a health check, not a job. */
const PROBE_TIMEOUT_MS = 10_000

export interface SttHealthOptions {
  /** Override the probe budget. Exists so tests need not wait 10 s for real. */
  probeTimeoutMs?: number
}

export async function checkSttHealth(
  env: EnvLike = process.env,
  options: SttHealthOptions = {},
): Promise<SttHealth> {
  const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS
  const parsed = parseSttConfig(env)

  if (!parsed.ok) {
    // Distinguish "never set up" from "set up wrongly": the operator's next
    // action is completely different.
    const untouched = !env.STT_PROVIDER && !env.STT_BASE_URL && !env.STT_MODEL
    return {
      state: untouched ? 'UNCONFIGURED' : 'INVALID_CONFIGURATION',
      // `reason` names the variable, never its value — see parseSttConfig.
      detail: untouched ? 'No STT_* configuration is present.' : parsed.reason,
    }
  }

  const config = parsed.config
  let endpointHost: string
  try {
    endpointHost = new URL(config.baseUrl).host
  } catch {
    endpointHost = '(unparseable)'
  }

  const facts = {
    provider: config.provider,
    model: config.model,
    endpointHost,
    hasApiKey: config.apiKey.length > 0,
    language: config.language,
    timeoutMs: config.timeoutMs,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs)
  const startedAt = Date.now()

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/models`, {
      method: 'GET',
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ...facts,
      state: 'UNREACHABLE',
      detail: aborted
        ? `No response from ${endpointHost} within ${probeTimeoutMs}ms.`
        : `Could not reach ${endpointHost}.`,
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timer)
  }

  const latencyMs = Date.now() - startedAt

  if (response.status === 401 || response.status === 403) {
    return {
      ...facts,
      state: 'UNREACHABLE',
      detail: `${endpointHost} rejected this installation's credentials (${response.status}).`,
      latencyMs,
    }
  }
  if (response.status === 404) {
    // Common misconfiguration: STT_BASE_URL missing its /v1 suffix, so the
    // adapter would post to the wrong path too.
    return {
      ...facts,
      state: 'UNREACHABLE',
      detail: `${endpointHost} has no /models endpoint (404). Check that STT_BASE_URL includes the API prefix, e.g. https://host/v1.`,
      latencyMs,
    }
  }
  if (!response.ok) {
    return {
      ...facts,
      state: 'UNREACHABLE',
      detail: `${endpointHost} returned ${response.status}.`,
      latencyMs,
    }
  }

  // The endpoint answered. Report whether the configured model is listed —
  // advisory only, since some servers do not enumerate models.
  let modelAvailable: boolean | undefined
  try {
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> }
    if (Array.isArray(body?.data)) {
      modelAvailable = body.data.some((m) => typeof m.id === 'string' && m.id === config.model)
    }
  } catch {
    modelAvailable = undefined
  }

  return {
    ...facts,
    state: 'REACHABLE',
    modelAvailable,
    latencyMs,
    detail:
      modelAvailable === false
        ? `${endpointHost} responded, but did not list "${config.model}". Transcription may still work if the server accepts unlisted models.`
        : `${endpointHost} responded.`,
  }
}
