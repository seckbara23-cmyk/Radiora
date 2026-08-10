import { describe, it, expect } from 'vitest'
import { parseSttConfig, isSttConfigured, SUPPORTED_STT_PROVIDERS } from '@/lib/stt/config'
import { createOpenAiCompatibleProvider } from '@/lib/stt/openai-compatible'
import {
  SttError,
  isSupportedSttMime,
  mimeForAudioExtension,
  type SpeechToTextProvider,
} from '@/lib/stt/types'

// R2.7A — the speech-to-text boundary.
//
// Nothing here touches a real provider. What is tested is the contract: that an
// unconfigured or misconfigured installation transcribes NOTHING, that failures
// map to safe categories, and that a provider's response shape stops at this
// seam.

const GOOD = {
  STT_PROVIDER: 'openai-compatible',
  STT_MODEL: 'whisper-1',
  STT_BASE_URL: 'https://stt.example.com/v1',
  STT_API_KEY: 'secret-value',
}

describe('2-3. configuration fails closed', () => {
  it('no configuration means no transcription', () => {
    expect(parseSttConfig({}).ok).toBe(false)
    expect(isSttConfigured({})).toBe(false)
  })

  for (const missing of ['STT_PROVIDER', 'STT_MODEL', 'STT_BASE_URL'] as const) {
    it(`missing ${missing} fails closed`, () => {
      const env = { ...GOOD, [missing]: '' }
      const result = parseSttConfig(env)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain(missing)
    })
  }

  it('an unknown provider is refused rather than guessed at', () => {
    const result = parseSttConfig({ ...GOOD, STT_PROVIDER: 'some-vendor' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('not supported')
  })

  it('a remote endpoint without a key is refused', () => {
    // Otherwise a misconfiguration would post clinical audio to an open endpoint.
    const result = parseSttConfig({ ...GOOD, STT_API_KEY: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('STT_API_KEY')
  })

  it('a self-hosted loopback endpoint may legitimately have no key', () => {
    const result = parseSttConfig({
      ...GOOD, STT_API_KEY: '', STT_BASE_URL: 'http://localhost:8000/v1',
    })
    expect(result.ok).toBe(true)
  })

  it('plaintext http is refused off localhost', () => {
    const result = parseSttConfig({ ...GOOD, STT_BASE_URL: 'http://stt.example.com/v1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('https')
  })

  it('a malformed URL is refused', () => {
    expect(parseSttConfig({ ...GOOD, STT_BASE_URL: 'not a url' }).ok).toBe(false)
  })

  it('the timeout is bounded on both sides', () => {
    expect(parseSttConfig({ ...GOOD, STT_TIMEOUT_MS: '10' }).ok).toBe(false)
    expect(parseSttConfig({ ...GOOD, STT_TIMEOUT_MS: '99999999' }).ok).toBe(false)
    expect(parseSttConfig({ ...GOOD, STT_TIMEOUT_MS: 'soon' }).ok).toBe(false)
    expect(parseSttConfig({ ...GOOD, STT_TIMEOUT_MS: '60000' }).ok).toBe(true)
  })

  it('27. French is the default language hint', () => {
    const result = parseSttConfig(GOOD)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.language).toBe('fr')
  })

  it('a trailing slash on the base URL does not double up', () => {
    const result = parseSttConfig({ ...GOOD, STT_BASE_URL: 'https://stt.example.com/v1/' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.baseUrl).toBe('https://stt.example.com/v1')
  })

  it('there is exactly one supported provider family, and it is portable', () => {
    expect(SUPPORTED_STT_PROVIDERS).toEqual(['openai-compatible'])
  })
})

describe('5-7. audio formats', () => {
  it('5. the formats MobileRecorder actually produces are accepted', () => {
    // pickMime() prefers audio/mp4 (iOS), then webm/opus, then ogg/opus.
    for (const mime of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
      expect(isSupportedSttMime(mime), mime).toBe(true)
    }
  })

  it('6. the formats importReportAudio accepts are accepted', () => {
    for (const mime of ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'video/mp4']) {
      expect(isSupportedSttMime(mime), mime).toBe(true)
    }
  })

  it('7. an unlabelled or unsupported container is refused', () => {
    // A generic type tells the provider nothing; guessing a clinical
    // recording's container is how a silent mis-transcription starts.
    expect(isSupportedSttMime('application/octet-stream')).toBe(false)
    expect(isSupportedSttMime('text/plain')).toBe(false)
    expect(isSupportedSttMime('')).toBe(false)
    expect(isSupportedSttMime(null)).toBe(false)
  })

  it('the stored extension resolves a usable type', () => {
    expect(mimeForAudioExtension('webm')).toBe('audio/webm')
    expect(mimeForAudioExtension('M4A')).toBe('audio/m4a')
    expect(mimeForAudioExtension('mp3')).toBe('audio/mpeg')
    expect(mimeForAudioExtension('txt')).toBeNull()
  })
})

// ─── The adapter, against a stubbed transport ────────────────────────────────

const CONFIG = {
  provider: 'openai-compatible' as const,
  model: 'whisper-1',
  apiKey: 'secret-value',
  baseUrl: 'https://stt.example.com/v1',
  timeoutMs: 30_000,
  language: 'fr',
}

function withFetch(impl: typeof fetch, run: (p: SpeechToTextProvider) => Promise<void>) {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return run(createOpenAiCompatibleProvider(CONFIG)).finally(() => {
    globalThis.fetch = original
  })
}

const audio = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' })
const input = () => ({ audio: audio(), mimeType: 'audio/webm', filename: 'd.webm', language: 'fr' })

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('the adapter normalises the provider', () => {
  it('17-18. returns the transcript verbatim, uncleaned', async () => {
    const spoken = 'Le nodule mesure 12,5 millimètres.  Pas d’épanchement pleural.'
    await withFetch(async () => ok({ text: spoken, language: 'fr', duration: 4.2 }), async (p) => {
      const result = await p.transcribe(input())
      expect(result.text).toBe(spoken.trim())
      expect(result.language).toBe('fr')
      expect(result.durationSeconds).toBe(4.2)
      expect(result.provider).toBe('openai-compatible')
      expect(result.model).toBe('whisper-1')
    })
  })

  it('27. sends only audio, model and a language hint', async () => {
    let seen: FormData | null = null
    await withFetch(async (_url, init) => {
      seen = (init?.body as FormData) ?? null
      return ok({ text: 'bonjour' })
    }, async (p) => { await p.transcribe(input()) })

    const form = seen! as unknown as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('language')).toBe('fr')
    expect(form.get('file')).toBeInstanceOf(File)
    // 25. Nothing about the patient, report or clinic travels.
    for (const forbidden of ['reportId', 'report_id', 'clinicId', 'clinic_id', 'patient', 'accession']) {
      expect(form.get(forbidden), forbidden).toBeNull()
    }
  })

  it('never fabricates a confidence the provider did not give', async () => {
    await withFetch(async () => ok({ text: 'bonjour' }), async (p) => {
      const result = await p.transcribe(input())
      expect(result.confidence).toBeUndefined()
      expect(result.durationSeconds).toBeUndefined()
    })
  })

  it('sends the credential as a bearer header, never in the body', async () => {
    let headers: HeadersInit | undefined
    await withFetch(async (_u, init) => { headers = init?.headers; return ok({ text: 'x' }) },
      async (p) => { await p.transcribe(input()) })
    expect(JSON.stringify(headers)).toContain('Bearer')
  })
})

describe('19-23. failures map to safe categories', () => {
  const cases: Array<[number, string]> = [
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limited'],
    [413, 'too_large'],
    [415, 'unsupported_audio'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ]

  for (const [status, code] of cases) {
    it(`HTTP ${status} → ${code}`, async () => {
      await withFetch(async () => new Response('provider internals here', { status }), async (p) => {
        await expect(p.transcribe(input())).rejects.toMatchObject({ code })
      })
    })
  }

  it('the provider body never travels with the error', async () => {
    const leak = 'SECRET-INTERNAL-TRACE-abc123'
    await withFetch(async () => new Response(leak, { status: 500 }), async (p) => {
      await p.transcribe(input()).catch((err: SttError) => {
        expect(err.message).not.toContain(leak)
      })
    })
  })

  it('21. a provider that never answers becomes a timeout, not a hang', async () => {
    // A real abort: the adapter's own AbortController fires, fetch rejects with
    // an AbortError, and that must surface as `timeout` rather than `unknown`.
    const original = globalThis.fetch
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        })
      })) as typeof fetch

    try {
      // The smallest timeout the config allows, so the test is quick and the
      // abort path is the real one rather than a simulated rejection.
      const provider = createOpenAiCompatibleProvider({ ...CONFIG, timeoutMs: 20 })
      await expect(provider.transcribe(input())).rejects.toMatchObject({ code: 'timeout' })
    } finally {
      globalThis.fetch = original
    }
  })

  it('an unreachable provider is unavailable, not unknown', async () => {
    await withFetch(async () => { throw new Error('ECONNREFUSED') }, async (p) => {
      await expect(p.transcribe(input())).rejects.toMatchObject({ code: 'unavailable' })
    })
  })

  it('a non-JSON response is malformed, not a crash', async () => {
    await withFetch(async () => new Response('<html>', { status: 200 }), async (p) => {
      await expect(p.transcribe(input())).rejects.toMatchObject({ code: 'malformed_response' })
    })
  })

  it('a response without a text field is malformed', async () => {
    await withFetch(async () => ok({ result: 'oops' }), async (p) => {
      await expect(p.transcribe(input())).rejects.toMatchObject({ code: 'malformed_response' })
    })
  })

  it('23. an empty transcript is rejected — silence never becomes content', async () => {
    await withFetch(async () => ok({ text: '   ' }), async (p) => {
      await expect(p.transcribe(input())).rejects.toMatchObject({ code: 'empty_transcript' })
    })
  })

  it('8. zero-byte audio never reaches the provider', async () => {
    let called = false
    await withFetch(async () => { called = true; return ok({ text: 'x' }) }, async (p) => {
      await expect(p.transcribe({
        audio: new Blob([], { type: 'audio/webm' }), mimeType: 'audio/webm', filename: 'd.webm',
      })).rejects.toMatchObject({ code: 'empty_audio' })
    })
    expect(called).toBe(false)
  })
})

describe('28-33. French clinical dictation survives the boundary', () => {
  const SPOKEN = [
    'Le nodule mesure 12,5 millimètres.',
    'Lésion de 3.5 cm du segment VII.',
    'Nodule de 12 × 8 mm.',
    'Pas d’épanchement pleural.',
    'Lésion du lobe supérieur droit.',
    'Aspect compatible avec une pneumopathie.',
    'Un processus tumoral ne peut être exclu.',
    'Je corrige, quatorze millimètres.',
  ].join(' ')

  it('the adapter returns it untouched', async () => {
    await withFetch(async () => ok({ text: SPOKEN }), async (p) => {
      const result = await p.transcribe(input())
      // 18. Byte-equivalent to what the provider said: no cleanup, no
      // translation, no rewriting at this layer.
      expect(result.text).toBe(SPOKEN)
      for (const fragment of [
        '12,5 millimètres', '3.5 cm', '12 × 8 mm', 'Pas d’épanchement',
        'lobe supérieur droit', 'compatible avec', 'ne peut être exclu', 'Je corrige',
      ]) {
        expect(result.text, fragment).toContain(fragment)
      }
    })
  })
})
