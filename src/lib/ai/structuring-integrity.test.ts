import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runStructuring } from '@/lib/ai/structuring-engine'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import {
  createCoordinator, beginRevision, reconcile, liveSections, markPhysicianEdit,
} from '@/lib/reports/live-coordinator'

// R2.6 — the integrity checks §26 asks for, as executable tests rather than a
// one-off grep: no parseStructuredText bypass, no second content model, no
// clinical source documents committed.

// fileURLToPath, not .pathname — a repo path with a space arrives percent-encoded.
const SRC = fileURLToPath(new URL('../../', import.meta.url))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const FILES = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f))
const CODE = (f: string) =>
  readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('no parseStructuredText bypass was reintroduced', () => {
  it('only the engine and its own module call the parser', () => {
    const allowed = new Set(['hpd-engine.ts', 'structuring-engine.ts'])
    const offenders = FILES.filter((f) => {
      if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) return false
      if (allowed.has(f.split(/[\\/]/).pop()!)) return false
      return /\bparseStructuredText(WithProvenance)?\s*\(/.test(CODE(f))
    })
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([])
  })

  it('the radiologist path runs the FULL pipeline, not the parser alone', () => {
    // R1 found generateHPDDraft reaching past runStructuring; R2.0 fixed it and
    // this keeps it fixed.
    const draft = buildHpdDraft({
      rawTranscript: 'Résultats : nodule de 12 mm. Je corrige, 14 mm.',
      modality: 'CT', bodyPart: 'thorax',
    })
    expect(draft.structuring.correctionEvents.length).toBeGreaterThan(0)
    expect(draft.structuring.confidence.length).toBe(5)
    expect(draft.output.results).toContain('14 mm')
  })
})

describe('no second report content model', () => {
  it('nothing writes a rival content column', () => {
    const invented = [
      'structured_content', 'report_content', 'findings_json',
      'external_findings', 'ai_findings_text', 'sections_json',
    ]
    // Production code only: a test that names the forbidden columns in order to
    // forbid them is not a violation.
    for (const f of FILES.filter((x) => !/\.test\.tsx?$/.test(x))) {
      const code = CODE(f)
      for (const column of invented) {
        expect(code, `${f.replace(SRC, '')} / ${column}`).not.toContain(column)
      }
    }
  })

  it('the canonical payload is still StructuredReportData', () => {
    const draft = buildHpdDraft({ rawTranscript: 'Résultats : foie normal.', modality: 'CT', bodyPart: null })
    expect(Object.keys(draft.output)).toEqual(
      expect.arrayContaining(['examType', 'examTitle', 'patient', 'indication', 'technique', 'results', 'conclusion']),
    )
  })
})

describe('no clinical source documents in the repository', () => {
  it('no PDF/DOCX/DICOM fixtures were added', () => {
    const publicDir = fileURLToPath(new URL('../../../public/', import.meta.url))
    let files: string[] = []
    try { files = walk(publicDir) } catch { files = [] }
    const clinical = files.filter((f) => /\.(pdf|docx|dcm|dicom)$/i.test(f))
    expect(clinical.map((f) => f.replace(publicDir, ''))).toEqual([])
  })
})

describe('the engine stays local and deterministic', () => {
  it('no network call anywhere in the structuring chain', () => {
    const chain = [
      'lib/ai/structuring-engine.ts', 'lib/ai/hpd-engine.ts', 'lib/ai/section-router.ts',
      'lib/ai/self-correction.ts', 'lib/ai/sentences.ts', 'lib/ai/french-cleanup.ts',
      'lib/safety/section-duplication.ts', 'lib/reports/live-coordinator.ts',
      'lib/reports/external-ai-apply.ts',
    ]
    for (const rel of chain) {
      const code = CODE(join(SRC, rel)).toLowerCase()
      for (const forbidden of ['fetch(', 'xmlhttprequest', 'websocket', 'openai', 'anthropic']) {
        expect(code, `${rel} / ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('the same transcript always produces the same sections', () => {
    const input = {
      rawTranscript: 'Indication : céphalées. Petite hyperdensité frontale droite. Au total, contusion.',
      modality: 'CT', bodyPart: 'cerveau',
      patientName: '', patientAge: '', patientSex: '', locale: 'fr',
    }
    const a = runStructuring(input).structured
    const b = runStructuring(input).structured
    expect({ ...a, generatedAt: '' }).toEqual({ ...b, generatedAt: '' })
  })
})

describe('23-24. the R2.5 guarantees survive R2.6', () => {
  const step = (state: ReturnType<typeof createCoordinator>, text: string) => {
    const begun = beginRevision(state, text)
    if (!begun.changed) return state
    const d = buildHpdDraft({ rawTranscript: text, modality: 'CT', bodyPart: 'cerveau' })
    return reconcile(begun.state, {
      revision: begun.revision, stableTranscript: text, draft: d.output, meta: d.structuring,
    }).state
  }

  it('23. a doctor-edited section stays locked', () => {
    let c = createCoordinator()
    c = step(c, 'Résultats : petite hyperdensité frontale droite.')
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')
    c = step(c, 'Résultats : petite hyperdensité frontale droite. Pas d’effet de masse.')
    expect(liveSections(c).results).toBe('TEXTE DU RADIOLOGUE')
    expect(c.suggestions.results).toBeDefined()
  })

  it('24. stale revision protection still discards out-of-order results', () => {
    let c = createCoordinator()
    const early = beginRevision(c, 'Résultats : foie normal.')
    c = early.state
    const late = beginRevision(c, 'Résultats : foie normal. Rate normale.')
    c = late.state

    const lateDraft = buildHpdDraft({ rawTranscript: 'Résultats : foie normal. Rate normale.', modality: 'CT', bodyPart: null })
    const applied = reconcile(c, {
      revision: late.revision, stableTranscript: 'Résultats : foie normal. Rate normale.',
      draft: lateDraft.output, meta: lateDraft.structuring,
    })
    const newer = liveSections(applied.state).results

    const earlyDraft = buildHpdDraft({ rawTranscript: 'Résultats : foie normal.', modality: 'CT', bodyPart: null })
    const stale = reconcile(applied.state, {
      revision: early.revision, stableTranscript: 'Résultats : foie normal.',
      draft: earlyDraft.output, meta: earlyDraft.structuring,
    })
    expect(stale.outcome).toBe('stale')
    expect(liveSections(stale.state).results).toBe(newer)
  })

  it('an indication-only dictation no longer fills findings live', () => {
    const c = step(createCoordinator(), 'Indication traumatisme crânien.')
    const sections = liveSections(c)
    expect(sections.indication).toContain('traumatisme crânien')
    expect(sections.results).toBe('')
  })
})
