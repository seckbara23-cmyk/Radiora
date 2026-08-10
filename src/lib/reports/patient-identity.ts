// R2.7C — patient identity has ONE authoritative source: the patient row.
//
// THE PRODUCTION DEFECT THIS EXISTS TO KILL
// `structureReportTranscript` called `buildHpdDraft` without any patient
// context. `buildHpdDraft` defaults the three fields to '', and the HPD engine
// renders `context.patientName || '—'`, so the draft was born carrying the
// literal string "—". Pressing "Appliquer au compte rendu" replaced the whole
// structured draft, patient block included; the save persisted "—" into
// `reports.structured_data`; and every later read preferred the stored block
// over the patient row. The report then showed
//
//     NOM – PRÉNOMS: —     ÂGE: —     SEXE: —
//
// for a patient the database knew perfectly well, and the exported PDF printed
// the same dashes for ÂGE and SEXE.
//
// The rule below is deliberately one-directional: the patient row wins whenever
// it has a value. Nothing in the product lets a radiologist type a patient name
// into a report, so a stored value can only ever be a copy — or a placeholder —
// and treating it as authoritative is what let a placeholder become permanent.
//
// Pure: no IO, no React. This is the whole rule.

import type { StructuredPatient, StructuredReportData } from '@/types/report'

/** Patient identity as the report page resolves it from the patient row. */
export interface PatientIdentity {
  name: string
  age:  string
  sex:  string
}

/** French labels for the `patient_sex` enum, as printed on the HPD document. */
export const SEX_LABELS_FR: Record<string, string> = {
  male:    'Masculin',
  female:  'Féminin',
  other:   'Autre',
  unknown: '',
}

export function frenchSexLabel(sex: string | null | undefined): string {
  return SEX_LABELS_FR[(sex ?? '').trim()] ?? ''
}

/** "NOM Prénom", the form the HPD header prints. */
export function displayPatientName(lastName: string | null, firstName: string | null): string {
  return `${(lastName ?? '').toUpperCase()} ${firstName ?? ''}`.trim()
}

/**
 * Age at `now`, as the document prints it. `now` is a parameter so this stays
 * pure and testable; callers pass the request clock.
 */
export function ageLabel(dob: string | null | undefined, now: Date = new Date()): string {
  if (!dob) return ''
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return ''
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 ? `${age} ans` : ''
}

/**
 * Values that mean "nobody filled this in". The em dash is what the HPD engine
 * substitutes for missing context, so a stored "—" is an absence that was
 * accidentally written down, not a fact about the patient.
 */
export function isPlaceholderIdentity(value: string | null | undefined): boolean {
  const t = (value ?? '').trim()
  return t === '' || t === '—' || t === '–' || t === '-' || t === '--'
}

/** Prefer the authoritative value; never carry a placeholder forward. */
function resolveField(authoritative: string, stored: string | undefined): string {
  const live = (authoritative ?? '').trim()
  if (live) return live
  return isPlaceholderIdentity(stored) ? '' : (stored as string)
}

/** Resolve one patient block against the authoritative identity. */
export function resolvePatientBlock(
  stored: StructuredPatient | undefined | null,
  identity: PatientIdentity,
): StructuredPatient {
  return {
    // `serviceOrWard` is report-owned — it has no column of its own — so it is
    // preserved rather than resolved.
    ...(stored ?? {}),
    name: resolveField(identity.name, stored?.name),
    age:  resolveField(identity.age,  stored?.age),
    sex:  resolveField(identity.sex,  stored?.sex),
  }
}

/**
 * Return `sd` with its patient block resolved against the patient row.
 *
 * Applied at every point structured data enters the editor — loaded from the
 * report, produced by a structuring run, or applied from a draft — so a
 * placeholder can neither arrive nor survive.
 */
export function withPatient<T extends StructuredReportData>(sd: T, identity: PatientIdentity): T {
  return { ...sd, patient: resolvePatientBlock(sd.patient, identity) }
}
