import { describe, it, expect } from 'vitest'
import { evaluateSigningReadiness } from '@/lib/safety/signing-gate'
import type { StructuredReportData } from '@/types/report'
import type { SectionConfidence } from '@/types/structuring'

// F10 #1 — the signing gate. A report may be signed only when every required
// section is non-empty, none assesses LOW, and no unresolved AI flag remains.

const LONG = 'Texte clinique substantiel décrivant les résultats de l\'examen en détail.' // ≥40 chars → high

function structured(over: Partial<StructuredReportData> = {}): StructuredReportData {
  return {
    language: 'fr',
    examType: 'scanner_cerebral',
    examTitle: 'SCANNER CÉRÉBRAL',
    patient: { name: 'TEST Patient', age: '50 ans', sex: 'Masculin' },
    indication: LONG,
    technique: LONG,
    results: LONG,
    conclusion: LONG,
    ...over,
  }
}

describe('evaluateSigningReadiness — structured reports', () => {
  it('allows signing a complete, substantial report', () => {
    const r = evaluateSigningReadiness({ structuredData: structured() })
    expect(r.canSign).toBe(true)
    expect(r.blockers).toHaveLength(0)
  })

  it('blocks signing when CONCLUSION is empty', () => {
    const r = evaluateSigningReadiness({ structuredData: structured({ conclusion: '' }) })
    expect(r.canSign).toBe(false)
    expect(r.blockers.some((b) => b.type === 'empty_section' && b.section === 'conclusion')).toBe(true)
  })

  it('blocks signing when a required section is LOW confidence (too thin)', () => {
    const r = evaluateSigningReadiness({ structuredData: structured({ results: 'RAS' }) })
    expect(r.canSign).toBe(false)
    expect(r.blockers.some((b) => b.type === 'low_confidence' && b.section === 'results')).toBe(true)
  })

  it('blocks signing on an unresolved AI review flag while content is still thin', () => {
    const aiConfidence: SectionConfidence[] = [
      { section: 'conclusion', confidence: 'low', reviewRequired: true },
    ]
    // conclusion is medium-length (15–39) so not LOW, but the AI flag is unresolved
    const r = evaluateSigningReadiness({
      structuredData: structured({ conclusion: 'Conclusion brève ici.' }),
      aiConfidence,
    })
    expect(r.canSign).toBe(false)
    expect(r.blockers.some((b) => b.type === 'review_required' && b.section === 'conclusion')).toBe(true)
  })

  it('clears an AI review flag once the section is substantial (high)', () => {
    const aiConfidence: SectionConfidence[] = [
      { section: 'conclusion', confidence: 'low', reviewRequired: true },
    ]
    const r = evaluateSigningReadiness({ structuredData: structured(), aiConfidence })
    expect(r.canSign).toBe(true)
  })
})

describe('evaluateSigningReadiness — legacy reports', () => {
  it('requires only RÉSULTATS and CONCLUSION', () => {
    const ok = evaluateSigningReadiness({ findings: LONG, impression: LONG })
    expect(ok.canSign).toBe(true)
  })

  it('blocks a legacy report missing the conclusion', () => {
    const r = evaluateSigningReadiness({ findings: LONG, impression: '' })
    expect(r.canSign).toBe(false)
    expect(r.blockers.some((b) => b.section === 'conclusion')).toBe(true)
  })
})
