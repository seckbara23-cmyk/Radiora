'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { clinicCanWrite, READ_ONLY_MESSAGE } from '@/lib/billing/access'
import { canSignReports } from '@/lib/safety/authority'
import { evaluateReportWrite } from '@/lib/safety/immutability'
import { createReportVersion, type VersionDb, type VersionSnapshotInput } from '@/lib/reports/versioning'
import { evaluateSigningReadiness, describeBlockers } from '@/lib/safety/signing-gate'
import { getReportSafetyContext } from '@/lib/data/safety'
import { enqueueWhatsAppNotification } from '@/lib/notifications/enqueue'
import type { StructuredReportData } from '@/types/report'

export type FormState = { error: string | null; saved?: boolean }

const REPORT_WRITE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const
const AMEND_ROLES        = ['super_admin', 'clinic_admin', 'radiologist'] as const

type WriteRole = typeof REPORT_WRITE_ROLES[number]
type AmendRole = typeof AMEND_ROLES[number]

// ─── Version snapshot helper ─────────────────────────────────────────────────

type SB = Awaited<ReturnType<typeof createClient>>

// R0.2 — snapshots go through the shared, error-checked writer. supabase-js
// never throws, so failures are returned, not caught. Routine save/sign
// snapshots degrade with an audit entry; the pre-amendment snapshot ABORTS
// the amendment (see amendReport) because it is the only preserved copy of
// the signed document.
async function snapshotVersion(
  supabase: SB,
  userId: string,
  clinicId: string | null,
  opts: VersionSnapshotInput,
): Promise<{ error: string | null }> {
  const result = await createReportVersion(supabase as unknown as VersionDb, opts)
  if (result.error) {
    await logAudit({
      userId, clinicId,
      action: 'report.version_snapshot_failed', entityType: 'report', entityId: opts.reportId,
      metadata: { action: opts.action ?? null, error: result.error },
    })
  }
  return result
}

// ─── Structured data helper ───────────────────────────────────────────────────

function parseStructuredDataField(raw: string | null): StructuredReportData | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as StructuredReportData
  } catch {
    return null
  }
}

// ─── createReport ─────────────────────────────────────────────────────────────

export async function createReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!REPORT_WRITE_ROLES.includes(user.role as WriteRole)) {
    return { error: 'You do not have permission to create reports.' }
  }

  // Subscription gate: a lapsed clinic is read-only — no new reports.
  if (!(await clinicCanWrite(user.clinicId))) {
    return { error: READ_ONLY_MESSAGE }
  }

  const studyId   = ((formData.get('study_id')   as string) ?? '').trim()
  const patientId = ((formData.get('patient_id') as string) ?? '').trim()

  if (!studyId || !patientId) return { error: 'Missing required fields.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reports')
    .insert({
      clinic_id:  user.clinicId,
      study_id:   studyId,
      patient_id: patientId,
      author_id:  user.id,
      status:     'draft',
      findings:   '',
      impression: '',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.created', entityType: 'report', entityId: data.id,
    metadata: { studyId, patientId },
  })

  revalidatePath(`/studies/${studyId}`)
  redirect(`/reports/${data.id}`)
}

// ─── saveDraftReport ─────────────────────────────────────────────────────────

export async function saveDraftReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!REPORT_WRITE_ROLES.includes(user.role as WriteRole)) {
    return { error: 'You do not have permission to edit reports.' }
  }

  if (!(await clinicCanWrite(user.clinicId))) {
    return { error: READ_ONLY_MESSAGE }
  }

  const id              = ((formData.get('id')              as string) ?? '').trim()
  const findings        = ((formData.get('findings')        as string) ?? '').trim()
  const impression      = ((formData.get('impression')      as string) ?? '').trim()
  const recommendations = ((formData.get('recommendations') as string) ?? '').trim() || null
  const structuredData  = parseStructuredDataField(formData.get('structured_data') as string | null)

  if (!id) return { error: 'Missing report ID.' }

  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('reports')
    .select('status, clinic_id')
    .eq('id', id)
    .single()

  if (readError || !existing) return { error: 'Report not found.' }

  // R0.2 — finalized content is immutable outside the amendment workflow.
  const gate = evaluateReportWrite({
    kind: 'draft_save', currentStatus: existing.status as string, actorRole: user.role,
  })
  if (!gate.allowed) return { error: gate.reason }

  const updatePayload: Record<string, unknown> = { findings, impression, recommendations }
  if (structuredData) {
    updatePayload.structured_data = structuredData
    updatePayload.exam_type       = structuredData.examType
  }

  const { error } = await supabase
    .from('reports')
    .update(updatePayload)
    .eq('id', id)

  if (error) return { error: error.message }

  await snapshotVersion(supabase, user.id, user.clinicId, {
    reportId:        id,
    clinicId:        user.clinicId,
    findings,
    impression,
    recommendations,
    structuredData:  structuredData ?? null,
    status:          existing.status as string,
    createdBy:       user.id,
    action:          'saved',
  })

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.saved', entityType: 'report', entityId: id,
    metadata: { structured: !!structuredData },
  })

  revalidatePath(`/reports/${id}`)
  return { error: null, saved: true }
}

// ─── finalizeReport ───────────────────────────────────────────────────────────

export async function finalizeReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  // Only a radiologist may validate and sign. clinic_admin/super_admin have no
  // clinical signing authority by default — see canSignReports().
  if (!canSignReports(user.role)) {
    return { error: 'Only a radiologist can validate and sign reports.' }
  }

  if (!(await clinicCanWrite(user.clinicId))) {
    return { error: READ_ONLY_MESSAGE }
  }

  const id              = ((formData.get('id')              as string) ?? '').trim()
  const studyId         = ((formData.get('study_id')        as string) ?? '').trim()
  const findings        = ((formData.get('findings')        as string) ?? '').trim()
  const impression      = ((formData.get('impression')      as string) ?? '').trim()
  const recommendations = ((formData.get('recommendations') as string) ?? '').trim() || null
  const structuredData  = parseStructuredDataField(formData.get('structured_data') as string | null)

  if (!id || !studyId) return { error: 'Missing required fields.' }

  // ── Signing gate ────────────────────────────────────────────────────────────
  // Block signing if any required section is empty, assesses to LOW confidence,
  // or has an unresolved AI review flag. The gate evaluates current content, so
  // the radiologist resolves a flag by writing adequate content.
  const contentInput = { structuredData, findings, impression, recommendations }
  const safety = await getReportSafetyContext(id)
  const readiness = evaluateSigningReadiness({
    ...contentInput,
    aiConfidence: safety?.aiConfidence ?? null,
  })

  if (!readiness.canSign) {
    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'report.signing_blocked', entityType: 'report', entityId: id,
      metadata: { blockers: readiness.blockers },
    })
    return { error: describeBlockers(readiness.blockers) }
  }

  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('reports')
    .select('status')
    .eq('id', id)
    .single()

  if (readError || !existing) return { error: 'Report not found.' }

  const gate = evaluateReportWrite({
    kind: 'finalize', currentStatus: existing.status as string, actorRole: user.role,
  })
  if (!gate.allowed) return { error: gate.reason }

  const updatePayload: Record<string, unknown> = {
    findings,
    impression,
    recommendations,
    status: 'finalized',
  }
  if (structuredData) {
    updatePayload.structured_data = structuredData
    updatePayload.exam_type       = structuredData.examType
  }

  const { error } = await supabase
    .from('reports')
    .update(updatePayload)
    .eq('id', id)

  if (error) return { error: error.message }

  // DB trigger (handle_report_finalized) sets signed_at automatically.
  // DB trigger (on_report_finalized_sync_study) advances study status to 'reported'.

  await snapshotVersion(supabase, user.id, user.clinicId, {
    reportId:        id,
    clinicId:        user.clinicId,
    findings,
    impression,
    recommendations,
    structuredData:  structuredData ?? null,
    status:          'finalized',
    createdBy:       user.id,
    action:          'signed',
  })

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.finalized', entityType: 'report', entityId: id,
    metadata: { studyId, structured: !!structuredData, signed: true, signedBy: user.id },
  })

  // Phase 4F — notify if the clinic enabled WhatsApp for validated reports.
  // PHI-free by construction; best-effort (never blocks finalization).
  await enqueueWhatsAppNotification(user.clinicId, 'report_validated')

  revalidatePath(`/reports/${id}`)
  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/reports')
  redirect(`/studies/${studyId}`)
}

// ─── amendReport ─────────────────────────────────────────────────────────────

export async function amendReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!AMEND_ROLES.includes(user.role as AmendRole)) {
    return { error: 'You do not have permission to amend reports.' }
  }

  if (!(await clinicCanWrite(user.clinicId))) {
    return { error: READ_ONLY_MESSAGE }
  }

  const id           = ((formData.get('id')            as string) ?? '').trim()
  const changeReason = ((formData.get('change_reason') as string) ?? '').trim()

  if (!id)           return { error: 'Missing report ID.' }
  if (!changeReason) return { error: 'A reason is required to amend a finalized report.' }

  const supabase = await createClient()

  const { data: current, error: readError } = await supabase
    .from('reports')
    .select('findings, impression, recommendations, status, signed_at, structured_data')
    .eq('id', id)
    .eq('status', 'finalized')
    .single()

  if (readError || !current) return { error: 'Report not found or is not in a finalized state.' }

  // R0.2 — the pre-amendment snapshot is the only preserved copy of the signed
  // document (the DB trigger clears signed_at when the status leaves
  // 'finalized'). If it cannot be written, the amendment MUST NOT proceed.
  const snapshot = await snapshotVersion(supabase, user.id, user.clinicId, {
    reportId:        id,
    clinicId:        user.clinicId,
    findings:        current.findings as string,
    impression:      current.impression as string,
    recommendations: (current.recommendations as string | null) ?? null,
    structuredData:  current.structured_data ?? null,
    signedAt:        (current.signed_at as string | null) ?? null,
    status:          'finalized',
    createdBy:       user.id,
    action:          'amended',
    changeReason,
    extraDiff: {
      previousStatus:   'finalized',
      previousSignedAt: (current.signed_at as string | null) ?? null,
    },
  })

  if (snapshot.error) {
    return {
      error:
        'Amendment aborted: the signed report could not be snapshotted, so the original would be lost. ' +
        snapshot.error,
    }
  }

  const { error } = await supabase
    .from('reports')
    .update({ status: 'amended' })
    .eq('id', id)
    .eq('status', 'finalized')

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.amended', entityType: 'report', entityId: id,
    metadata: { changeReason },
  })

  revalidatePath(`/reports/${id}`)
  redirect(`/reports/${id}`)
}

// ─── handleReportForm ─────────────────────────────────────────────────────────

export async function handleReportForm(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const submit = (formData.get('_submit') as string | null) ?? 'save'
  if (submit === 'finalize') return finalizeReport(prev, formData)
  if (submit === 'amend')    return amendReport(prev, formData)
  return saveDraftReport(prev, formData)
}
