// R2.7A — resolving the configured speech-to-text provider.
//
// SERVER ONLY. Reads STT_* from the environment; none of them are
// NEXT_PUBLIC_, so Next.js never inlines them into a client bundle.
//
// Fails closed by construction: with no configuration there is no provider and
// no transcription. There is deliberately no mock or offline fallback — a
// clinical product must never manufacture words nobody said because a service
// was unreachable.

import { parseSttConfig, type EnvLike, type SttConfig } from '@/lib/stt/config'
import { createOpenAiCompatibleProvider } from '@/lib/stt/openai-compatible'
import { SttError, type SpeechToTextProvider } from '@/lib/stt/types'

export function buildSttProvider(config: SttConfig): SpeechToTextProvider {
  switch (config.provider) {
    case 'openai-compatible':
      return createOpenAiCompatibleProvider(config)
  }
}

/**
 * The configured provider, or an `SttError('not_configured')` describing what is
 * missing. The reason names the variable, never its value.
 */
export function getSttProvider(env: EnvLike = process.env): SpeechToTextProvider {
  if (typeof window !== 'undefined') {
    throw new SttError('not_configured', 'transcription is server-side only')
  }
  const parsed = parseSttConfig(env)
  if (!parsed.ok) throw new SttError('not_configured', parsed.reason)
  return buildSttProvider(parsed.config)
}

/** Language + timeout the caller needs without re-parsing. */
export function getSttSettings(env: EnvLike = process.env): SttConfig | null {
  const parsed = parseSttConfig(env)
  return parsed.ok ? parsed.config : null
}

export { parseSttConfig, isSttConfigured } from '@/lib/stt/config'
export * from '@/lib/stt/types'
