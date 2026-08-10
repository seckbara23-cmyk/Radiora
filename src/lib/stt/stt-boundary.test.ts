import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// R2.7A — the boundary checks §26 and §30 ask for, as executable tests rather
// than a one-off grep: the provider secret cannot reach the browser, the
// adapter cannot be imported by a client component, and no clinical layer was
// bypassed.

const SRC  = fileURLToPath(new URL('../../', import.meta.url))
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const FILES = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f))
const PROD  = FILES.filter((f) => !/\.test\.tsx?$/.test(f))
const CODE  = (f: string) =>
  readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const rel = (f: string) => f.replace(SRC, '').replace(/\\/g, '/')

/**
 * Extract each `logAudit({ … })` payload by matching braces rather than
 * guessing an indentation — a regex that assumed one indent ran straight past a
 * nested call and swallowed unrelated code.
 */
function auditCalls(code: string): string[] {
  const out: string[] = []
  const marker = 'logAudit({'
  let from = 0
  for (;;) {
    const start = code.indexOf(marker, from)
    if (start < 0) break
    let depth = 0
    let i = start + marker.length - 1
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') { depth--; if (depth === 0) { i++; break } }
    }
    out.push(code.slice(start, i))
    from = i
  }
  return out
}

/** Files Next.js will ship to the browser. */
const CLIENT_FILES = PROD.filter((f) => /^['"]use client['"]/.test(readFileSync(f, 'utf8').trimStart()))

describe('4-51. the provider secret is server-only', () => {
  it('STT_API_KEY is never read outside the STT config module', () => {
    const readers = PROD.filter((f) => CODE(f).includes('STT_API_KEY'))
    expect(readers.map(rel)).toEqual(['lib/stt/config.ts'])
  })

  it('no STT variable is exposed as NEXT_PUBLIC_', () => {
    for (const f of PROD) {
      expect(CODE(f), rel(f)).not.toMatch(/NEXT_PUBLIC_STT/)
    }
  })

  it('no client component imports the adapter or the provider factory', () => {
    const offenders = CLIENT_FILES.filter((f) => {
      const code = CODE(f)
      return /from ['"]@\/lib\/stt(\/(index|openai-compatible|config))?['"]/.test(code)
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('client code may only use the pure lifecycle vocabulary', () => {
    // The workspace needs stage names, not provider machinery.
    const workspace = CODE(join(SRC, 'app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx'))
    expect(workspace).toContain('@/lib/dictation/transcription-state')
    expect(workspace).not.toContain('@/lib/stt')
  })

  it('the built client bundle contains no STT configuration name or value', () => {
    const dir = join(ROOT, '.next', 'static')
    if (!existsSync(dir)) {
      // `npx next build` runs in validation; skip cleanly when it has not.
      expect(true).toBe(true)
      return
    }
    const assets = walk(dir).filter((f) => /\.(js|mjs|json|txt)$/.test(f))
    expect(assets.length).toBeGreaterThan(0)
    for (const asset of assets) {
      const content = readFileSync(asset, 'utf8')
      for (const needle of ['STT_API_KEY', 'STT_BASE_URL', 'STT_PROVIDER', 'audio/transcriptions']) {
        expect(content.includes(needle), `${needle} found in ${asset.replace(ROOT, '')}`).toBe(false)
      }
    }
  })
})

describe('the provider stops at the boundary', () => {
  it('no vendor SDK was added', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    for (const vendor of ['openai', '@anthropic-ai/sdk', 'groq-sdk', '@deepgram/sdk', '@google-cloud/speech']) {
      expect(deps, vendor).not.toContain(vendor)
    }
  })

  it('no media-processing stack was added for transcoding', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    for (const heavy of ['fluent-ffmpeg', '@ffmpeg/ffmpeg', 'ffmpeg-static', 'sox']) {
      expect(deps, heavy).not.toContain(heavy)
    }
  })

  it('only the adapter talks HTTP to a provider', () => {
    const callers = PROD.filter((f) => /audio\/transcriptions/.test(CODE(f)))
    expect(callers.map(rel)).toEqual(['lib/stt/openai-compatible.ts'])
  })

  it('provider response fields never leak into the domain', () => {
    // Downstream code sees SpeechToTextResult, never a vendor payload shape.
    for (const f of PROD.filter((x) => !rel(x).startsWith('lib/stt/'))) {
      expect(CODE(f), rel(f)).not.toMatch(/response_format|transcription_response|whisper_/)
    }
  })
})

describe('35-37. no clinical layer was bypassed', () => {
  it('35. parseStructuredText still has exactly two legitimate callers', () => {
    const allowed = new Set(['lib/ai/hpd-engine.ts', 'lib/ai/structuring-engine.ts'])
    const offenders = PROD.filter(
      (f) => !allowed.has(rel(f)) && /\bparseStructuredText(WithProvenance)?\s*\(/.test(CODE(f)),
    )
    expect(offenders.map(rel)).toEqual([])
  })

  it('36-37. the router and correction engine are still reached only through the engine', () => {
    // A module that DEFINES a function is not a caller of it.
    const callersOf = (name: string, definedIn: string) =>
      PROD.filter((f) => rel(f) !== definedIn && new RegExp(`\\b${name}\\s*\\(`).test(CODE(f))).map(rel)

    expect(callersOf('routeTranscript', 'lib/ai/section-router.ts')).toEqual(['lib/ai/hpd-engine.ts'])

    // `lib/demo/demo-structuring.ts` also calls the correction engine. It is the
    // PUBLIC LANDING-PAGE demo: it runs the canonical `runStructuring` and
    // additionally inspects correction events to display them. It touches no
    // report, no database and no PHI, and R2.7A does not make it reachable from
    // the clinical path — so it is named here rather than quietly excluded.
    expect(callersOf('detectSelfCorrections', 'lib/ai/self-correction.ts'))
      .toEqual(['lib/ai/structuring-engine.ts', 'lib/demo/demo-structuring.ts'])

    // What matters clinically: nothing in the report path reaches past the engine.
    const clinical = PROD.filter((f) => /^(lib\/actions|lib\/reports|app)\//.test(rel(f)))
    for (const f of clinical) {
      expect(CODE(f), rel(f)).not.toMatch(/\bdetectSelfCorrections\s*\(/)
      expect(CODE(f), rel(f)).not.toMatch(/\brouteTranscript\s*\(/)
    }
  })

  it('no provider-specific structuring route was created', () => {
    for (const f of PROD) {
      const code = CODE(f)
      for (const forbidden of ['mobileStructuring', 'importStructuring', 'sttStructuring']) {
        expect(code, `${rel(f)} / ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

describe('no clinical text reaches an audit payload anywhere', () => {
  it('every logAudit call in the dictation/transcription path passes lengths, not words', () => {
    const paths = [
      'lib/actions/transcription.ts',
      'lib/actions/dictation.ts',
      'lib/actions/report-dictation.ts',
    ]
    for (const p of paths) {
      const code = CODE(join(SRC, p))
      for (const call of auditCalls(code)) {
        for (const forbidden of ['raw_text', 'correctedText', 'rawText:', 'transcript:', 'token']) {
          expect(call, `${p} / ${forbidden}`).not.toContain(forbidden)
        }
      }
    }
  })
})
