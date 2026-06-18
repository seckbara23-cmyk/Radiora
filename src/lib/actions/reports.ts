'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { canSignReports } from '@/lib/safety/authority'
import { evaluateSigningReadiness, describeBlockers } from '@/lib/safety/signing-gate'
import { getReportSafetyContext } from '@/lib/data/safety'
import type { StructuredReportData } from '@/types/report'

export type FormState = { error: string | null; saved?: boolean }

const REPORT_WRITE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const
const AMEND_ROLES        = ['super_admin', 'clinic_admin', 'radiologist'] as const

type WriteRole = typeof REPORT_WRITE_ROLES[number]
type AmendRole = typeof AMEND_ROLES[number]

// ─── Version snapshot helper ─────────────────────────────────────────────────

type SB = Awaited<ReturnType<typeof createClient>>

async function createVersion(
  supabase: SB,
  opts: {
    reportId: string
    clinicId: string | null
    findings: string
    impression: string
    recommendations: string | null
    status: string
    createdBy: string
    /** What triggered the snapshot: saved | finalized | amended. */
    action?: string
    changeReason?: string | null
  }
): Promise<void> {
  try {
    // Fetch the latest version both for numbering and to compute a diff.
    const { data: prev } = await supabase
      .from('report_versions')
      .select('version_number, findings, impression, recommendations')
      .eq('report_id', opts.reportId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const versionNumber = ((prev?.version_number as number | null) ?? 0) + 1

    // Diff metadata: which clinical sections changed since the previous snapshot.
    const changed: string[] = []
    if ((prev?.findings as string | null ?? '')        !== opts.findings)              changed.push('results')
    if ((prev?.impression as string | null ?? '')      !== opts.impression)            changed.push('conclusion')
    if ((prev?.recommendations as string | null ?? '') !== (opts.recommendations ?? '')) changed.push('recommendations')
    const diff = { changedSections: prev ? changed : ['results', 'conclusion', 'recommendations'], previousVersion: (prev?.version_number as number | null) ?? null }

    await supabase.from('report_versions').insert({
      report_id:       opts.reportId,
      clinic_id:       opts.clinicId,
      version_number:  versionNumber,
      findings:        opts.findings,
      impression:      opts.impression,
      recommendations: opts.recommendations,
      status:          opts.status,
      created_by:      opts.createdBy,
      action:          opts.action ?? null,
      diff,
      change_reason:   opts.changeReason ?? null,
    })
  } catch {
    // Version failures must never block the primary clinical operation.
  }
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

  const id              = ((formData.get('id')              as string) ?? '').trim()
  const findings        = ((formData.get('findings')        as string) ?? '').trim()
  const impression      = ((formData.get('impression')      as string) ?? '').trim()
  const recommendations = ((formData.get('recommendations') as string) ?? '').trim() || null
  const structuredData  = parseStructuredDataField(formData.get('structured_data') as string | null)

  if (!id) return { error: 'Missing report ID.' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('reports')
    .select('status, clinic_id')
    .eq('id', id)
    .single()

  if (!existing) return { error: 'Report not found.' }
  if (existing.status === 'finalized') {
    return { error: 'Finalized reports cannot be edited directly. Use "Amend Report" to re-open.' }
  }

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

  await createVersion(supabase, {
    reportId:        id,
    clinicId:        user.clinicId,
    findings,
    impression,
    recommendations,
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

  const { data: existing } = await supabase
    .from('reports')
    .select('status')
    .eq('id', id)
    .single()

  if (!existing) return { error: 'Report not found.' }
  if (existing.status === 'finalized') {
    return { error: 'Report is already finalized.' }
  }

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

  await createVersion(supabase, {
    reportId:        id,
    clinicId:        user.clinicId,
    findings,
    impression,
    recommendations,
    status:          'finalized',
    createdBy:       user.id,
    action:          'signed',
  })

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.finalized', entityType: 'report', entityId: id,
    metadata: { studyId, structured: !!structuredData, signed: true, signedBy: user.id },
  })

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

  const id           = ((formData.get('id')            as string) ?? '').trim()
  const changeReason = ((formData.get('change_reason') as string) ?? '').trim()

  if (!id)           return { error: 'Missing report ID.' }
  if (!changeReason) return { error: 'A reason is required to amend a finalized report.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from('reports')
    .select('findings, impression, recommendations, status')
    .eq('id', id)
    .eq('status', 'finalized')
    .single()

  if (!current) return { error: 'Report not found or is not in a finalized state.' }

  await createVersion(supabase, {
    reportId:        id,
    clinicId:        user.clinicId,
    findings:        current.findings as string,
    impression:      current.impression as string,
    recommendations: (current.recommendations as string | null) ?? null,
    status:          'finalized',
    createdBy:       user.id,
    action:          'amended',
    changeReason,
  })

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
