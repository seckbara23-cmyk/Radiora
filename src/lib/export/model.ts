// Feature 9 — deterministic export model.
//
// This module is PURE: it turns already-loaded report/study/patient/clinic/
// radiologist data into a flat, presentation-ready ReportExportModel. The PDF and
// DOCX renderers consume ONLY this model — they never see raw transcripts, never
// call AI, and never mutate clinical content. Section order is fixed here, once,
// so every output (PDF, DOCX, print) is guaranteed identical in structure.

import type { StructuredReportData } from '@/types/report'
import { buildSignatureName, coerceSignatureStyle } from '@/lib/profile/signature'
import { buildSpecialFormTable, type SpecialFormTable } from '@/lib/reports/special-forms'
import { isPlaceholderIdentity } from '@/lib/reports/patient-identity'

export type { SpecialFormTable } from '@/lib/reports/special-forms'

export interface ExportSection {
  label: string
  body: string
  /** F18 — a measurement table rendered above the body (special exam forms). */
  table?: SpecialFormTable
}

export interface ExportPatientField {
  label: string
  value: string
}

export interface ExportHeader {
  /** Text above the institution name (e.g. military command lines). */
  overline: string
  hospital: string
  department: string
  /** Line below the department (e.g. equipment list). */
  subtitle: string
  address: string
  contact: string
}

// A header chosen from the hospital-header library (F12), overriding the
// clinic's default letterhead. Null/undefined → use the clinic default.
export interface ExportHeaderOverride {
  name: string
  overline?: string
  department?: string
  subtitle?: string
  address?: string
  phone?: string
  email?: string
}

export interface ExportSignature {
  name: string
  title: string
  signedDate: string // '' when not finalized
}

export interface ReportExportModel {
  isDraft: boolean
  watermark: string // 'BROUILLON' when draft, '' otherwise
  header: ExportHeader
  patientFields: ExportPatientField[]
  examTitle: string
  examDate: string
  examNumber: string
  sections: ExportSection[]
  signature: ExportSignature
  filenameBase: string // safe, no extension
}

// Narrow input shapes — decoupled from the data-layer types so the builder stays
// trivially testable and never reaches for anything server-side.
export interface ExportInputReport {
  status: string
  signedAt?: string
  structuredData?: StructuredReportData
  findings: string
  impression: string
  recommendations?: string
  examType?: string
  createdAt: string
}
export interface ExportInputStudy {
  studyDate?: string
  accessionNumber?: string
  modality?: string
  bodyPart?: string
}
export interface ExportInputPatient {
  firstName: string
  lastName: string
  dateOfBirth?: string
  sex: string
}
export interface ExportInputClinic {
  name: string
  departmentName?: string
  reportHeader?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  website?: string
}
export interface ExportInputRadiologist {
  firstName: string
  lastName: string
  signatureTitle?: string
  /** F11 signature preference — honorific, style and custom text. */
  titlePrefix?: string
  signatureStyle?: string
  signatureCustom?: string
}

export interface ReportExportInput {
  report: ExportInputReport
  study: ExportInputStudy | null
  patient: ExportInputPatient | null
  clinic: ExportInputClinic | null
  radiologist: ExportInputRadiologist | null
  /** Library header to use instead of the clinic default (F12). */
  headerOverride?: ExportHeaderOverride | null
  /** When false, emit the "classic" model with no letterhead at all (F12). */
  includeHeader?: boolean
}

const SEX_FR: Record<string, string> = {
  male: 'Masculin',
  female: 'Féminin',
  other: 'Autre',
  unknown: '',
}

// Sensible defaults preserve the look of the existing print page when a clinic has
// not configured its own letterhead yet.
const DEFAULT_HOSPITAL = 'Hôpital Principal de Dakar'
const DEFAULT_DEPARTMENT = 'Service de Radiologie et Imagerie Médicale'

function computeAge(dob: string | undefined): string {
  if (!dob) return ''
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 ? `${age} ans` : ''
}

function clean(value: string | undefined | null): string {
  return (value ?? '').trim()
}

// Filenames must be safe on every OS and free of PHI-breaking characters while
// still carrying exam_date / patient_name / exam_type / exam_number (req. #14).
export function safeFilenamePart(value: string, max = 48): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

export function buildReportExportModel(input: ReportExportInput): ReportExportModel {
  const { report, study, patient, clinic, radiologist } = input
  const sd = report.structuredData

  const finalized = report.status === 'finalized' || Boolean(report.signedAt)
  const isDraft = !finalized

  // ── Header / letterhead ──
  // Three modes (F12): explicit "no header" (classic), a library override, or the
  // clinic's own default letterhead.
  const EMPTY_HEADER: ExportHeader = {
    overline: '', hospital: '', department: '', subtitle: '', address: '', contact: '',
  }

  let header: ExportHeader
  if (input.includeHeader === false) {
    header = EMPTY_HEADER
  } else if (input.headerOverride) {
    const o = input.headerOverride
    const contact = [
      clean(o.phone) && `Tél : ${clean(o.phone)}`,
      clean(o.email),
    ].filter(Boolean).join('   ·   ')
    header = {
      overline: clean(o.overline),
      hospital: clean(o.name),
      department: clean(o.department),
      subtitle: clean(o.subtitle),
      address: clean(o.address),
      contact,
    }
  } else {
    const contactParts = [
      clean(clinic?.phone) && `Tél : ${clean(clinic?.phone)}`,
      clean(clinic?.email),
      clean(clinic?.website),
    ].filter(Boolean) as string[]
    header = {
      overline: '',
      hospital: clean(clinic?.reportHeader) || clean(clinic?.name) || DEFAULT_HOSPITAL,
      department: clean(clinic?.departmentName) || DEFAULT_DEPARTMENT,
      subtitle: '',
      address: [clean(clinic?.address), clean(clinic?.city)].filter(Boolean).join(', '),
      contact: contactParts.join('   ·   '),
    }
  }

  // ── Patient identity block ──
  const patientName = patient
    ? `${clean(patient.lastName).toUpperCase()} ${clean(patient.firstName)}`.trim()
    : '—'
  const examDate = clean(study?.studyDate) || report.createdAt.slice(0, 10)
  const examNumber = clean(study?.accessionNumber) || '—'
  // R2.7C — a stored "—" is an ABSENCE that was accidentally written down, not
  // a fact about the patient. Reports saved before the R2.7C patient-context fix
  // carry exactly that, and preferring it over the patient row printed "ÂGE: —"
  // onto the PDF for a patient whose date of birth the database holds.
  const storedAge = clean(sd?.patient?.age)
  const storedSex = clean(sd?.patient?.sex)
  const age = (isPlaceholderIdentity(storedAge) ? '' : storedAge) || computeAge(patient?.dateOfBirth)
  const sex = (isPlaceholderIdentity(storedSex) ? '' : storedSex) || (patient ? SEX_FR[patient.sex] ?? '' : '')
  const service = clean(sd?.patient?.serviceOrWard)

  const patientFields: ExportPatientField[] = [
    { label: 'NOM — PRÉNOMS', value: patientName },
    { label: 'DATE', value: examDate },
    { label: "N° D'EXAMEN", value: examNumber },
  ]
  if (service) patientFields.push({ label: 'SERVICE', value: service })
  if (age) patientFields.push({ label: 'ÂGE', value: age })
  if (sex) patientFields.push({ label: 'SEXE', value: sex })

  // ── Exam title ──
  const examTitle =
    clean(sd?.examTitle) ||
    [clean(study?.modality), clean(study?.bodyPart)].filter(Boolean).join(' — ') ||
    'COMPTE RENDU'

  // ── Sections, ALWAYS in fixed clinical order (req. acceptance) ──
  const ordered: ExportSection[] = []
  const push = (label: string, body: string, table?: SpecialFormTable) => {
    const b = clean(body)
    if (b || table) ordered.push({ label, body: b, ...(table ? { table } : {}) })
  }
  if (sd) {
    push('INDICATION', sd.indication)
    push('TECHNIQUE', sd.technique)
    // F18 — special exams render RÉSULTATS as a measurement table (the text in
    // sd.results is the same data, kept for validation but not printed twice).
    if (sd.specialForm) {
      push('RÉSULTATS', '', buildSpecialFormTable(sd.specialForm))
    } else {
      push('RÉSULTATS', sd.results)
    }
    push('CONCLUSION', sd.conclusion)
    push('RECOMMANDATIONS', sd.recommendations ?? '')
  } else {
    // Legacy fallback — still emitted in the same canonical order.
    push('RÉSULTATS', report.findings)
    push('CONCLUSION', report.impression)
    push('RECOMMANDATIONS', report.recommendations ?? '')
  }

  // ── Signature block ──
  const radiologistName = radiologist
    ? buildSignatureName({
        titlePrefix: clean(radiologist.titlePrefix) || 'Dr',
        firstName: radiologist.firstName,
        lastName: radiologist.lastName,
        style: coerceSignatureStyle(radiologist.signatureStyle),
        custom: radiologist.signatureCustom,
      })
    : ''
  const signature: ExportSignature = {
    name: radiologistName || 'Le Radiologue',
    title: clean(radiologist?.signatureTitle) || 'Médecin Radiologue',
    signedDate: report.signedAt ? report.signedAt.slice(0, 10) : '',
  }

  // ── Safe filename ──
  const examTypeKey = clean(report.examType) || clean(sd?.examType) || clean(study?.modality) || 'cr'
  const filenameBase = [
    safeFilenamePart(examDate, 10),
    safeFilenamePart(patientName, 40),
    safeFilenamePart(examTypeKey, 32),
    safeFilenamePart(examNumber, 32),
  ]
    .filter(Boolean)
    .join('_')

  return {
    isDraft,
    watermark: isDraft ? 'BROUILLON' : '',
    header,
    patientFields,
    examTitle,
    examDate,
    examNumber,
    sections: ordered,
    signature,
    filenameBase: filenameBase || 'compte-rendu',
  }
}
