import { describe, it, expect } from 'vitest'
import { buildReportExportModel, type ReportExportInput } from '@/lib/export/model'

// F10 #1 — export gates. A draft exports ONLY with a BROUILLON watermark; a
// validated/signed report exports clean. The model is the single source of truth
// for every renderer (PDF / DOCX / print), so the watermark cannot diverge.

function input(over: Partial<ReportExportInput['report']> = {}): ReportExportInput {
  return {
    report: {
      status: 'draft',
      findings: 'Résultats de l\'examen.',
      impression: 'Conclusion de l\'examen.',
      createdAt: '2026-06-18T10:00:00.000Z',
      ...over,
    },
    study: { studyDate: '2026-06-18', modality: 'IRM', bodyPart: 'Crâne' },
    patient: { firstName: 'Jean', lastName: 'Dupont', sex: 'male' },
    clinic: { name: 'Clinique Test' },
    radiologist: { firstName: 'Abibou', lastName: 'BA' },
  }
}

describe('export watermark gate', () => {
  it('a draft report is watermarked BROUILLON', () => {
    const m = buildReportExportModel(input({ status: 'draft' }))
    expect(m.isDraft).toBe(true)
    expect(m.watermark).toBe('BROUILLON')
  })

  it('an in_review report is still a draft (BROUILLON)', () => {
    const m = buildReportExportModel(input({ status: 'in_review' }))
    expect(m.isDraft).toBe(true)
    expect(m.watermark).toBe('BROUILLON')
  })

  it('a finalized report exports clean (no watermark)', () => {
    const m = buildReportExportModel(input({ status: 'finalized', signedAt: '2026-06-18T11:00:00.000Z' }))
    expect(m.isDraft).toBe(false)
    expect(m.watermark).toBe('')
    expect(m.signature.signedDate).toBe('2026-06-18')
  })

  it('a signed report (signedAt present) exports clean even if status lags', () => {
    const m = buildReportExportModel(input({ status: 'draft', signedAt: '2026-06-18T11:00:00.000Z' }))
    expect(m.isDraft).toBe(false)
    expect(m.watermark).toBe('')
  })

  it('keeps clinical sections in fixed order and never invents content', () => {
    const m = buildReportExportModel(input({ status: 'finalized', findings: 'A', impression: 'B', recommendations: '' }))
    const labels = m.sections.map((s) => s.label)
    expect(labels).toEqual(['RÉSULTATS', 'CONCLUSION'])
  })
})
