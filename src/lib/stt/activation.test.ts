import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkSttHealth } from '@/lib/stt/health'
import {
  SYNTHETIC_DICTATION,
  SYNTHETIC_TRANSCRIPT,
  SYNTHETIC_TRANSCRIPT_DIGITS,
  survivingHazards,
  invertedMeanings,
  clinicalFold,
} from '@/lib/stt/synthetic-dictation'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import { detectSelfCorrections } from '@/lib/ai/self-correction'

// R2.7C — activation readiness.
//
// SCOPE, STATED HONESTLY: nothing here contacts a real provider. These are
// STATIC and UNIT checks of the diagnostic, the synthetic fixture and the
// deterministic pipeline. Whether a real endpoint transcribes French radiology
// well can only be measured against a configured endpoint, and is NOT asserted
// anywhere in this suite.

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const HEALTH = strip(read('lib/stt/health.ts'))
const ROUTE  = strip(read('app/api/admin/stt-health/route.ts'))

const GOOD = {
  STT_PROVIDER: 'openai-compatible',
  STT_MODEL: 'whisper-1',
  STT_BASE_URL: 'https://stt.example.com/v1',
  STT_API_KEY: 'super-secret-value',
}

// ─── The diagnostic ───────────────────────────────────────────────────────────

describe('the activation diagnostic distinguishes the states an operator needs', () => {
  it('UNCONFIGURED when nothing is set', async () => {
    const health = await checkSttHealth({})
    expect(health.state).toBe('UNCONFIGURED')
    expect(health.detail).toContain('No STT_* configuration')
  })

  it('INVALID_CONFIGURATION when it is set up wrongly — a different fix', async () => {
    const health = await checkSttHealth({ ...GOOD, STT_BASE_URL: 'http://stt.example.com/v1' })
    expect(health.state).toBe('INVALID_CONFIGURATION')
    expect(health.detail).toContain('https')
  })

  it('names the offending variable, never its value', async () => {
    const health = await checkSttHealth({ ...GOOD, STT_MODEL: '' })
    expect(health.detail).toContain('STT_MODEL')
    expect(JSON.stringify(health)).not.toContain('super-secret-value')
  })

  it('probes /models — it never transcribes to prove reachability', () => {
    expect(HEALTH).toContain('/models')
    expect(HEALTH).not.toContain('audio/transcriptions')
    expect(HEALTH).not.toContain('FormData')
  })

  it('REACHABLE when the endpoint answers, and reports model availability', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'whisper-1' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    try {
      const health = await checkSttHealth(GOOD)
      expect(health.state).toBe('REACHABLE')
      expect(health.modelAvailable).toBe(true)
      expect(health.endpointHost).toBe('stt.example.com')
      expect(typeof health.latencyMs).toBe('number')
    } finally {
      globalThis.fetch = original
    }
  })

  it('flags a model the endpoint does not list, without calling it a failure', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'something-else' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    try {
      const health = await checkSttHealth(GOOD)
      expect(health.state).toBe('REACHABLE')
      expect(health.modelAvailable).toBe(false)
      expect(health.detail).toContain('did not list')
    } finally {
      globalThis.fetch = original
    }
  })

  const unreachable: Array<[number, string]> = [
    [401, 'credentials'],
    [403, 'credentials'],
    [404, 'STT_BASE_URL includes the API prefix'],
    [500, 'returned 500'],
  ]
  for (const [status, fragment] of unreachable) {
    it(`UNREACHABLE on ${status}, with actionable detail`, async () => {
      const original = globalThis.fetch
      globalThis.fetch = (async () => new Response('provider internals', { status })) as typeof fetch
      try {
        const health = await checkSttHealth(GOOD)
        expect(health.state).toBe('UNREACHABLE')
        expect(health.detail).toContain(fragment)
        // A provider body must never travel with the diagnostic.
        expect(JSON.stringify(health)).not.toContain('provider internals')
      } finally {
        globalThis.fetch = original
      }
    })
  }

  it('UNREACHABLE rather than a hang when the endpoint never answers', async () => {
    const original = globalThis.fetch
    globalThis.fetch = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () =>
          rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })) as typeof fetch
    try {
      // The probe has its own short budget, independent of STT_TIMEOUT_MS.
      // Overridden here so the abort path is exercised for real without the
      // suite waiting the full ten seconds.
      const health = await checkSttHealth(GOOD, { probeTimeoutMs: 25 })
      expect(health.state).toBe('UNREACHABLE')
      expect(health.detail).toContain('within 25ms')
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('the diagnostic leaks nothing', () => {
  it('never returns the API key, only whether one exists', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch
    try {
      const health = await checkSttHealth(GOOD)
      const body = JSON.stringify(health)
      expect(body).not.toContain('super-secret-value')
      expect(health.hasApiKey).toBe(true)
      // Host only — not the full URL, which could carry a path secret.
      expect(body).not.toContain('https://stt.example.com/v1')
    } finally {
      globalThis.fetch = original
    }
  })

  it('sends no audio, no patient and no report identifier', () => {
    for (const forbidden of ['reportId', 'clinicId', 'patient', 'accession', 'audio', 'Blob']) {
      expect(HEALTH, forbidden).not.toContain(forbidden)
    }
  })

  it('mutates nothing', () => {
    for (const forbidden of ['insert(', 'update(', 'delete(', 'transcription_runs', 'audio_assets']) {
      expect(HEALTH, forbidden).not.toContain(forbidden)
    }
  })

  it('the endpoint is super_admin only and audits state alone', () => {
    expect(ROUTE).toContain("user.role !== 'super_admin'")
    expect(ROUTE).toContain('status: 403')
    expect(ROUTE).toMatch(/metadata: \{ state: health\.state \}/)
    // The audit must not carry the endpoint or the key.
    const audit = ROUTE.slice(ROUTE.indexOf('logAudit'))
    for (const forbidden of ['endpointHost', 'apiKey', 'baseUrl']) {
      expect(audit, forbidden).not.toContain(forbidden)
    }
  })

  it('is not part of the clinical product surface', () => {
    const nav = readFileSync(
      fileURLToPath(new URL('../../config/navigation.ts', import.meta.url)), 'utf8',
    )
    expect(nav).not.toContain('stt-health')
  })
})

// ─── The synthetic fixture ────────────────────────────────────────────────────

describe('the synthetic dictation is safe to use in production', () => {
  it('contains no patient, no identifier and no real study', () => {
    const text = SYNTHETIC_DICTATION.map((p) => p.spoken).join(' ')
    // No names, no dates of birth, no MRN/accession shapes.
    expect(text).not.toMatch(/\b(?:M\.|Mme|Monsieur|Madame)\b/)
    expect(text).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/)
    expect(text).not.toMatch(/\bMRN|ACC-|IPP\b/i)
  })

  it('covers every hazard that changes a diagnosis', () => {
    const hazards = new Set(SYNTHETIC_DICTATION.map((p) => p.hazard))
    expect(hazards).toEqual(new Set([
      'negation', 'laterality', 'decimal-measurement', 'spoken-correction', 'hedging',
    ]))
  })

  it('the survival check actually detects a lost fragment', () => {
    // Proving the instrument works, rather than trusting it.
    expect(survivingHazards(SYNTHETIC_TRANSCRIPT_DIGITS)).toEqual([])
    expect(survivingHazards(SYNTHETIC_TRANSCRIPT)).toEqual([])
    const mangled = SYNTHETIC_TRANSCRIPT_DIGITS.replace(/absence/gi, '').replace(/pleural/gi, '')
    expect(survivingHazards(mangled).some((r) => r.hazard === 'negation')).toBe(true)
  })

  it('accepts either the word form or the digit form of a measurement', () => {
    // A provider may emit "douze virgule cinq" or "12,5"; both are correct.
    expect(survivingHazards(SYNTHETIC_TRANSCRIPT)).toEqual([])
    expect(survivingHazards(SYNTHETIC_TRANSCRIPT_DIGITS)).toEqual([])
  })

  it('tolerates the sentence punctuation and casing a provider may not reproduce', () => {
    // Realistic variance: a provider may drop sentence punctuation and use its
    // own capitalisation. It must NOT be modelled as stripping every comma —
    // a digit-flanked comma is a decimal separator, and removing it turns
    // "12,5 mm" into "12 5 mm", which is corruption rather than formatting.
    const asProviderMightEmit = SYNTHETIC_TRANSCRIPT_DIGITS
      .replace(/(?<!\d)[.,](?!\d)/g, ' ')
      .toUpperCase()
    expect(asProviderMightEmit).toContain('12,5')

    const lost = survivingHazards(asProviderMightEmit).flatMap((r) => r.missing)
    expect(lost).toEqual([])
  })

  it('a destroyed decimal separator IS reported as a lost fragment', () => {
    // The inverse of the above: if a provider really did emit "12 5 mm", the
    // fixture must notice rather than wave it through.
    const corrupted = SYNTHETIC_TRANSCRIPT_DIGITS.replace('12,5', '12 5')
    expect(survivingHazards(corrupted).some((r) => r.hazard === 'decimal-measurement')).toBe(true)
  })

  it('folds accents, so "hémorragie" and "hemorragie" compare equal', () => {
    expect(clinicalFold('Pas d’hémorragie')).toBe("pas d'hemorragie")
  })
})

// ─── The deterministic pipeline, on that fixture ──────────────────────────────

describe('Radiora handles the synthetic dictation correctly', () => {
  // This is what R2.7C can prove WITHOUT a provider: given the words, the
  // downstream safety rules behave. Provider accuracy is a separate gate.
  const draft = buildHpdDraft({
    rawTranscript: SYNTHETIC_TRANSCRIPT_DIGITS, modality: 'CT', bodyPart: 'cerveau',
  })
  const all = [
    draft.output.indication, draft.output.technique, draft.output.results,
    draft.output.conclusion, draft.output.recommendations ?? '',
  ].join(' ')

  it('negation is preserved, never inverted', () => {
    expect(clinicalFold(all)).toContain("pas d'hemorragie")
    expect(clinicalFold(all)).toContain('absence')
    expect(clinicalFold(all)).not.toContain("presence d'hemorragie")
  })

  it('the decimal measurement is CORRECTED, not duplicated', () => {
    // "Je corrige, 14 mm" supersedes 12,5. A report still saying 12,5 would
    // mean the correction was ignored; a report saying both would be worse.
    expect(all).toContain('14 mm')
    expect(all).not.toContain('12,5')
    expect(clinicalFold(all)).toContain('lobe superieur')
  })

  it('the spoken measurement correction is applied surgically', () => {
    const { corrected } = detectSelfCorrections(
      'Nodule du lobe supérieur droit mesurant 12,5 mm. Je corrige, 14 mm.',
    )
    expect(corrected).toBe('Nodule du lobe supérieur droit mesurant 14 mm.')
    expect(corrected).toContain('lobe supérieur droit')
  })

  it('the laterality correction changes the side and leaves no contradiction', () => {
    const { corrected } = detectSelfCorrections('Lésion rénale droite. Je corrige, gauche.')
    expect(corrected).toBe('Lésion rénale gauche.')
    expect(clinicalFold(corrected)).not.toContain('renale droite')
  })

  it('hedging is never strengthened into a diagnosis', () => {
    expect(clinicalFold(all)).toContain('compatible avec')
    expect(clinicalFold(all)).not.toContain('diagnostic de')
  })

  it('no meaning was inverted or strengthened anywhere in the output', () => {
    expect(invertedMeanings(all)).toEqual([])
  })

  it('the RAW transcript keeps every hazard fragment', () => {
    // survivingHazards belongs to the raw transcript: after structuring, a
    // dictated correction has legitimately replaced the superseded value.
    expect(survivingHazards(draft.structuring.rawTranscript)).toEqual([])
  })

  it('nothing was invented — every word traces back to the dictation', () => {
    const said = new Set(clinicalFold(SYNTHETIC_TRANSCRIPT_DIGITS).split(/[^\p{L}\p{N}]+/u).filter(Boolean))
    const clinical = [draft.output.indication, draft.output.results, draft.output.conclusion].join(' ')
    for (const word of clinicalFold(clinical).split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
      expect(said, `"${word}" was not dictated`).toContain(word)
    }
  })

  it('the report is not signed by any of this', () => {
    expect(draft.output).not.toHaveProperty('signedAt')
    expect(JSON.stringify(draft.output)).not.toContain('finalized')
  })
})
