'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { buildExamInfo, buildDefaultTechnique } from '@/lib/ai/hpd-engine'
import type { StructuredReportData } from '@/types/report'
import type { UserRole } from '@/types/user'

// Who may create a report from the queue. Secretary IS allowed (draft only) —
// this is why the action runs through the service-role client: RLS blocks
// secretary from inserting reports/studies, but the workflow requires it.
// Validation/signature stay radiologist-only (enforced separately).
const CREATE_ROLES: UserRole[] = ['secretary', 'radiologist', 'clinic_admin', 'super_admin']

// French sex labels for the HPD document header (mirrors reports/[id]/page.tsx).
const SEX_FR: Record<string, string> = { male: 'Masculin', female: 'Féminin', other: 'Autre', unknown: '' }

function computeAge(dob: string | null | undefined): string {
  if (!dob) return ''
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 ? `${age} ans` : ''
}

function generateAccessionNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const suffix = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `ACC-${date}-${suffix}`
}

export type CreateFromQueueResult = {
  error:    string | null
  reportId?: string
  /** True when the item already had a report (idempotent no-op create). */
  existing?: boolean
}

/**
 * Creates a structured HPD report from a vacation queue item, pre-filled from
 * the item's patient/exam metadata, and links report_id back onto the item.
 *
 * Safety:
 *  - tenant isolation enforced in-action (every row uses user.clinicId; the item
 *    and patient must belong to the caller's clinic).
 *  - requires a matched patient (incomplete identity → caller confirms first).
 *  - duplicate-proof: the link is an atomic compare-and-swap on report_id IS NULL,
 *    so concurrent/double clicks never create two reports.
 *  - report is always created as a 'draft'; validation/signature stay radiologist-only.
 */
export async function createReportFromQueueItem(itemId: string): Promise<CreateFromQueueResult> {
  const user = await requireCurrentUser()
  if (!CREATE_ROLES.includes(user.role)) return { error: 'You do not have permission to create reports.' }
  if (!itemId) return { error: 'Missing queue item.' }
  if (!user.clinicId) return { error: 'Your account must be linked to a clinic.' }

  const admin = createAdminClient()

  // 1. Load the queue item and enforce tenant ownership.
  const { data: item } = await admin
    .from('vacation_items')
    .select('id, clinic_id, vacation_id, patient_id, study_id, report_id, assigned_radiologist_id, exam_number')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return { error: 'Queue item not found.' }
  if (item.clinic_id !== user.clinicId) return { error: 'This item belongs to another clinic.' }

  // 2. Idempotency: already linked → return the existing report.
  if (item.report_id) return { error: null, reportId: item.report_id as string, existing: true }

  // 3. Require a matched patient (confirmation step happens in the UI).
  if (!item.patient_id) {
    return { error: 'Confirm the patient identity before creating the report.' }
  }

  const { data: patient } = await admin
    .from('patients')
    .select('id, clinic_id, first_name, last_name, date_of_birth, sex')
    .eq('id', item.patient_id as string)
    .maybeSingle()
  if (!patient || patient.clinic_id !== user.clinicId) {
    return { error: 'Matched patient not found in your clinic.' }
  }

  // 4. Exam context from the vacation session.
  const { data: vac } = await admin
    .from('vacations')
    .select('modality, title, vacation_date, radiologist_id')
    .eq('id', item.vacation_id as string)
    .maybeSingle()
  const modality  = (vac?.modality as string | null) ?? null
  const bodyPart  = (vac?.title as string | null) ?? null
  const studyDate = (vac?.vacation_date as string | null) ?? new Date().toISOString().slice(0, 10)

  const { examType, examTitle } = buildExamInfo(modality, bodyPart)

  // 5. Reuse the linked study, or create one (reports require a study FK).
  let studyId = (item.study_id as string | null) ?? null
  let createdStudyId: string | null = null
  if (!studyId) {
    const { data: study, error: studyErr } = await admin
      .from('studies')
      .insert({
        clinic_id:        user.clinicId,
        patient_id:       patient.id,
        accession_number: generateAccessionNumber(),
        modality:         modality ?? 'CT',
        body_part:        bodyPart || examTitle,
        description:      examTitle,
        study_date:       studyDate,
        status:           'pending',
      })
      .select('id')
      .single()
    if (studyErr || !study) {
      return { error: studyErr?.code === '23505' ? 'Accession number collision — please retry.' : (studyErr?.message ?? 'Could not create study.') }
    }
    studyId = study.id as string
    createdStudyId = studyId
  }

  // 6. Seed a French structured HPD draft (opens directly in HPD mode).
  const structured: StructuredReportData = {
    language:    'fr',
    examType,
    examTitle,
    patient: {
      name: `${(patient.last_name as string ?? '').toUpperCase()} ${(patient.first_name as string) ?? ''}`.trim() || '—',
      age:  computeAge(patient.date_of_birth as string | null),
      sex:  SEX_FR[(patient.sex as string) ?? 'unknown'] ?? '',
    },
    indication:      '',
    technique:       buildDefaultTechnique(modality),
    results:         '',
    conclusion:      '',
    recommendations: undefined,
    generatedAt:     new Date().toISOString(),
  }

  const authorId = (item.assigned_radiologist_id as string | null) ?? (vac?.radiologist_id as string | null) ?? user.id

  const { data: report, error: reportErr } = await admin
    .from('reports')
    .insert({
      clinic_id:       user.clinicId,
      study_id:        studyId,
      patient_id:      patient.id,
      author_id:       authorId,
      status:          'draft',
      findings:        '',
      impression:      '',
      structured_data: structured as unknown as Record<string, unknown>,
      exam_type:       examType,
    })
    .select('id')
    .single()
  if (reportErr || !report) {
    if (createdStudyId) await admin.from('studies').delete().eq('id', createdStudyId)
    return { error: reportErr?.message ?? 'Could not create the report.' }
  }
  const reportId = report.id as string

  // 7. Atomic compare-and-swap link: only succeeds if still unlinked.
  const { data: linked } = await admin
    .from('vacation_items')
    .update({ report_id: reportId, study_id: studyId })
    .eq('id', itemId)
    .is('report_id', null)
    .select('id')

  if (!linked || linked.length === 0) {
    // Lost a race — another request linked a report first. Clean up ours.
    await admin.from('reports').delete().eq('id', reportId)
    if (createdStudyId) await admin.from('studies').delete().eq('id', createdStudyId)
    const { data: fresh } = await admin
      .from('vacation_items')
      .select('report_id')
      .eq('id', itemId)
      .maybeSingle()
    return { error: null, reportId: (fresh?.report_id as string) ?? undefined, existing: true }
  }

  // Mark the study as having a report (best-effort).
  await admin.from('studies').update({ has_report: true }).eq('id', studyId)

  try {
    await logAudit({
      userId:     user.id,
      clinicId:   user.clinicId,
      action:     'report_created_from_queue',
      entityType: 'report',
      entityId:   reportId,
      metadata:   { queueItemId: itemId, reportId, studyId, actorId: user.id },
    })
  } catch {
    // Audit failures never block the operation.
  }

  revalidatePath(`/vacations/items/${itemId}`)
  return { error: null, reportId }
}
