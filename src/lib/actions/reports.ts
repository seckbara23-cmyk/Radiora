'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'

export type FormState = { error: string | null; saved?: boolean }

const REPORT_WRITE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const

export async function createReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!REPORT_WRITE_ROLES.includes(user.role as typeof REPORT_WRITE_ROLES[number])) {
    return { error: 'You do not have permission to create reports.' }
  }

  const studyId   = (formData.get('study_id')   as string).trim()
  const patientId = (formData.get('patient_id') as string).trim()

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

export async function saveDraftReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!REPORT_WRITE_ROLES.includes(user.role as typeof REPORT_WRITE_ROLES[number])) {
    return { error: 'You do not have permission to edit reports.' }
  }

  const id              = (formData.get('id')              as string).trim()
  const findings        = (formData.get('findings')        as string).trim()
  const impression      = (formData.get('impression')      as string).trim()
  const recommendations = (formData.get('recommendations') as string | null)?.trim() || null

  if (!id) return { error: 'Missing report ID.' }

  const supabase = await createClient()

  // Only allow editing draft/in_review reports (finalized reports block writes via this action)
  const { data: existing } = await supabase
    .from('reports')
    .select('status')
    .eq('id', id)
    .single()

  if (!existing) return { error: 'Report not found.' }
  if (existing.status === 'finalized' && user.role !== 'clinic_admin' && user.role !== 'super_admin') {
    return { error: 'Finalized reports can only be edited by a clinic admin.' }
  }

  const { error } = await supabase
    .from('reports')
    .update({ findings, impression, recommendations })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(`/reports/${id}`)
  return { error: null, saved: true }
}

export async function finalizeReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!REPORT_WRITE_ROLES.includes(user.role as typeof REPORT_WRITE_ROLES[number])) {
    return { error: 'You do not have permission to finalize reports.' }
  }

  const id              = (formData.get('id')              as string).trim()
  const studyId         = (formData.get('study_id')        as string).trim()
  const findings        = (formData.get('findings')        as string).trim()
  const impression      = (formData.get('impression')      as string).trim()
  const recommendations = (formData.get('recommendations') as string | null)?.trim() || null

  if (!id || !studyId) return { error: 'Missing required fields.' }
  if (!findings)       return { error: 'Findings are required before finalizing.' }
  if (!impression)     return { error: 'Impression is required before finalizing.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reports')
    .update({ findings, impression, recommendations, status: 'finalized' })
    .eq('id', id)

  if (error) return { error: error.message }

  // DB trigger (handle_report_finalized) sets signed_at automatically.
  // DB trigger (sync_study_has_report) updates studies.has_report automatically.

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.finalized', entityType: 'report', entityId: id,
    metadata: { studyId },
  })

  revalidatePath(`/reports/${id}`)
  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/reports')
  redirect(`/studies/${studyId}`)
}

export async function handleReportForm(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const submit = (formData.get('_submit') as string | null) ?? 'save'
  if (submit === 'finalize') return finalizeReport(prev, formData)
  if (submit === 'amend')    return amendReport(prev, formData)
  return saveDraftReport(prev, formData)
}

export async function amendReport(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (user.role !== 'clinic_admin' && user.role !== 'super_admin') {
    return { error: 'Only clinic admins can amend finalized reports.' }
  }

  const id = (formData.get('id') as string).trim()
  if (!id) return { error: 'Missing report ID.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reports')
    .update({ status: 'amended' })
    .eq('id', id)
    .eq('status', 'finalized') // guard: only amend finalized reports

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'report.amended', entityType: 'report', entityId: id,
  })

  revalidatePath(`/reports/${id}`)
  redirect(`/reports/${id}`)
}
