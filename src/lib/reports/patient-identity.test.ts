import { describe, it, expect } from 'vitest'
import {
  withPatient,
  resolvePatientBlock,
  isPlaceholderIdentity,
  ageLabel,
  frenchSexLabel,
  displayPatientName,
} from '@/lib/reports/patient-identity'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import { buildReportExportModel } from '@/lib/export/model'
import type { StructuredReportData } from '@/types/report'

// R2.7C(F) — patient identity is deterministic across structure → apply → save
// → reload → export.
//
// PRODUCTION: after applying an AI structuring run and reloading, the document
// showed "NOM – PRÉNOMS: —  ÂGE: —  SEXE: —" for a patient the database knew.
// `structureReportTranscript` called buildHpdDraft with no patient context, the
// HPD engine substituted "—", and applying the draft replaced the whole
// structured block — patient included — which the save then made permanent.

const IDENTITY = { name: 'DIALLO Aminata', age: '46 ans', sex: 'Féminin' }

const REPORT = {
  id: 'r1', status: 'draft', findings: '', impression: '', recommendations: null,
  createdAt: '2026-08-10T09:00:00.000Z', signedAt: null, examType: 'scanner_cerebral',
}

const PATIENT = {
  firstName: 'Aminata', lastName: 'Diallo',
  dateOfBirth: '1980-01-01', sex: 'female',
}

const STUDY = {
  modality: 'CT', bodyPart: 'Cerveau', studyDate: '2026-08-10',
  accessionNumber: 'ACC-20260810-R27CTEST',
}

describe('the placeholder is recognised as an absence, not a value', () => {
  for (const v of ['—', '–', '-', '--', '', '   ', null, undefined]) {
    it(`${JSON.stringify(v)} is a placeholder`, () => {
      expect(isPlaceholderIdentity(v)).toBe(true)
    })
  }

  it('a real name is not', () => {
    expect(isPlaceholderIdentity('DIALLO Aminata')).toBe(false)
    expect(isPlaceholderIdentity('46 ans')).toBe(false)
  })
})

describe('the patient row is the only authority', () => {
  it('a stored placeholder is replaced by the real identity', () => {
    const block = resolvePatientBlock({ name: '—', age: '—', sex: '—' }, IDENTITY)
    expect(block).toEqual({ name: 'DIALLO Aminata', age: '46 ans', sex: 'Féminin' })
  })

  it('a stored value never overrides the patient row', () => {
    const block = resolvePatientBlock({ name: 'ANCIEN Nom', age: '30 ans', sex: 'Masculin' }, IDENTITY)
    expect(block.name).toBe('DIALLO Aminata')
    expect(block.age).toBe('46 ans')
    expect(block.sex).toBe('Féminin')
  })

  it('a placeholder is never written back when the row has nothing either', () => {
    const block = resolvePatientBlock({ name: '—', age: '—', sex: '—' }, { name: '', age: '', sex: '' })
    expect(block).toEqual({ name: '', age: '', sex: '' })
  })

  it('serviceOrWard is report-owned and survives — it has no column of its own', () => {
    const block = resolvePatientBlock(
      { name: '—', age: '—', sex: '—', serviceOrWard: 'Réanimation' },
      IDENTITY,
    )
    expect(block.serviceOrWard).toBe('Réanimation')
  })
})

describe('a structuring draft can no longer erase the patient', () => {
  it('buildHpdDraft with no patient context still yields the placeholder', () => {
    // The engine's behaviour is unchanged; this pins WHY the guard is needed.
    const { output } = buildHpdDraft({
      rawTranscript: 'Résultats : pas d’hémorragie.', modality: 'CT', bodyPart: 'Cerveau',
    })
    expect(output.patient.name).toBe('—')
  })

  it('buildHpdDraft WITH patient context carries the real identity', () => {
    const { output } = buildHpdDraft({
      rawTranscript: 'Résultats : pas d’hémorragie.', modality: 'CT', bodyPart: 'Cerveau',
      patientName: IDENTITY.name, patientAge: IDENTITY.age, patientSex: IDENTITY.sex,
    })
    expect(output.patient).toEqual(IDENTITY)
  })

  it('applying a placeholder-bearing draft preserves the real identity', () => {
    const { output } = buildHpdDraft({
      rawTranscript: 'Résultats : pas d’hémorragie.', modality: 'CT', bodyPart: 'Cerveau',
    })
    // This is exactly what handleAiAccept now does.
    expect(withPatient(output, IDENTITY).patient).toEqual(IDENTITY)
  })

  it('identity survives structure → apply → save → reload', () => {
    const { output } = buildHpdDraft({
      rawTranscript: 'Résultats : pas d’hémorragie.', modality: 'CT', bodyPart: 'Cerveau',
    })
    const applied = withPatient(output, IDENTITY)
    // The save is a JSON round trip through reports.structured_data.
    const reloaded = JSON.parse(JSON.stringify(applied)) as StructuredReportData
    expect(withPatient(reloaded, IDENTITY).patient).toEqual(IDENTITY)
  })
})

describe('the export model prints a real identity, not the placeholder', () => {
  const model = (sd: StructuredReportData | null) =>
    buildReportExportModel({
      report: { ...REPORT, structuredData: sd } as never,
      study: STUDY as never,
      patient: PATIENT as never,
      clinic: null,
      radiologist: null,
    })

  it('a report poisoned with "—" still exports the real age and sex', () => {
    const poisoned = {
      ...({} as StructuredReportData),
      language: 'fr', examType: 'scanner_cerebral', examTitle: 'SCANNER CÉRÉBRAL',
      patient: { name: '—', age: '—', sex: '—' },
      indication: 'Céphalées.', technique: 'Scanner sans injection.',
      results: 'Pas d’hémorragie.', conclusion: 'Examen normal.',
    } as StructuredReportData

    const fields = Object.fromEntries(model(poisoned).patientFields.map((f) => [f.label, f.value]))
    expect(fields['NOM — PRÉNOMS']).toBe('DIALLO Aminata')
    expect(fields['ÂGE']).not.toBe('—')
    expect(fields['ÂGE']).toContain('ans')
    expect(fields['SEXE']).toBe('Féminin')
  })

  it('a healthy report exports the same values', () => {
    const healthy = {
      language: 'fr', examType: 'scanner_cerebral', examTitle: 'SCANNER CÉRÉBRAL',
      patient: IDENTITY,
      indication: 'Céphalées.', technique: 'Scanner sans injection.',
      results: 'Pas d’hémorragie.', conclusion: 'Examen normal.',
    } as StructuredReportData
    const fields = Object.fromEntries(model(healthy).patientFields.map((f) => [f.label, f.value]))
    expect(fields['NOM — PRÉNOMS']).toBe('DIALLO Aminata')
    expect(fields['SEXE']).toBe('Féminin')
  })
})

describe('H — the export filename is a real value, not the UI example', () => {
  it('resolves date, patient, exam type and accession', () => {
    const m = buildReportExportModel({
      report: { ...REPORT, structuredData: null } as never,
      study: STUDY as never,
      patient: PATIENT as never,
      clinic: null,
      radiologist: null,
    })
    // The order the explanatory example in the Export panel must describe.
    expect(m.filenameBase.startsWith('2026-08-10_')).toBe(true)
    expect(m.filenameBase).toContain('DIALLO')
    expect(m.filenameBase).toContain('ACC-20260810-R27CTEST')
    expect(m.filenameBase).not.toContain('NomPatient')
    // Safe for a Content-Disposition header.
    expect(m.filenameBase).not.toMatch(/["\\/:*?<>|]/)
  })
})

describe('shared identity helpers', () => {
  it('renders the HPD name form', () => {
    expect(displayPatientName('Diallo', 'Aminata')).toBe('DIALLO Aminata')
    expect(displayPatientName(null, null)).toBe('')
  })

  it('maps the patient_sex enum to French', () => {
    expect(frenchSexLabel('female')).toBe('Féminin')
    expect(frenchSexLabel('male')).toBe('Masculin')
    expect(frenchSexLabel('unknown')).toBe('')
    expect(frenchSexLabel(null)).toBe('')
  })

  it('computes age against an injected clock', () => {
    expect(ageLabel('1980-01-01', new Date('2026-08-10T00:00:00Z'))).toBe('46 ans')
    expect(ageLabel('1980-12-31', new Date('2026-08-10T00:00:00Z'))).toBe('45 ans')
    expect(ageLabel(null)).toBe('')
    expect(ageLabel('not-a-date')).toBe('')
  })
})
