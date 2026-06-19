import { describe, it, expect } from 'vitest'
import { buildReportExportModel, type ReportExportInput } from './model'

// Minimal valid input; individual tests override only what they exercise.
function baseInput(over: Partial<ReportExportInput> = {}): ReportExportInput {
  return {
    report: {
      status: 'finalized',
      signedAt: '2026-06-18T10:00:00Z',
      findings: 'RAS.',
      impression: 'Examen normal.',
      createdAt: '2026-06-18T09:00:00Z',
    },
    study: { studyDate: '2026-06-18', accessionNumber: 'A-100', modality: 'CT', bodyPart: 'Crâne' },
    patient: { firstName: 'Awa', lastName: 'Diop', sex: 'female' },
    clinic: { name: 'Clinique Test', departmentName: 'Imagerie' },
    radiologist: { firstName: 'Abibou', lastName: 'Ba', signatureTitle: 'Pr' },
    ...over,
  }
}

describe('buildReportExportModel — F12 header modes', () => {
  it('uses the clinic default letterhead when no override and no opt-out', () => {
    const m = buildReportExportModel(baseInput())
    expect(m.header.hospital).toBe('Clinique Test')
    expect(m.header.department).toBe('Imagerie')
    expect(m.header.overline).toBe('')
    expect(m.header.subtitle).toBe('')
  })

  it('falls back to default hospital/department when clinic fields are blank', () => {
    const m = buildReportExportModel(baseInput({ clinic: { name: '' } }))
    expect(m.header.hospital).toBe('Hôpital Principal de Dakar')
    expect(m.header.department).toBe('Service de Radiologie et Imagerie Médicale')
  })

  it('emits an empty header (classic model) when includeHeader is false', () => {
    const m = buildReportExportModel(baseInput({ includeHeader: false }))
    expect(m.header).toEqual({
      overline: '', hospital: '', department: '', subtitle: '', address: '', contact: '',
    })
  })

  it('uses a library override with overline, subtitle and contact', () => {
    const m = buildReportExportModel(
      baseInput({
        headerOverride: {
          name: 'Établissement Hospitalier Militaire de Ziguinchor',
          overline: 'ETAT MAJOR GENERAL DES ARMEES\nZONE MILITAIRE 5',
          department: "SERVICE D'IMAGERIE MEDICALE",
          phone: '76 625 98 13',
          email: 'dssacmiaz@gmail.com',
        },
      }),
    )
    expect(m.header.hospital).toBe('Établissement Hospitalier Militaire de Ziguinchor')
    expect(m.header.overline).toContain('ZONE MILITAIRE 5')
    expect(m.header.department).toBe("SERVICE D'IMAGERIE MEDICALE")
    expect(m.header.contact).toBe('Tél : 76 625 98 13   ·   dssacmiaz@gmail.com')
  })

  it('override wins over includeHeader=false only when header is requested', () => {
    // includeHeader=false takes precedence — classic model regardless of override.
    const m = buildReportExportModel(
      baseInput({ includeHeader: false, headerOverride: { name: 'X' } }),
    )
    expect(m.header.hospital).toBe('')
  })

  it('override email-only contact omits the phone separator', () => {
    const m = buildReportExportModel(
      baseInput({ headerOverride: { name: 'Y', email: 'a@b.sn' } }),
    )
    expect(m.header.contact).toBe('a@b.sn')
  })
})
