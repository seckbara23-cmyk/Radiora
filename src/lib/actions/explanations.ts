'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { generateExplanationText, STANDARD_DISCLAIMER } from '@/lib/ai/explanation-engine'
import { mapExplanationRow } from '@/lib/data/explanations'
import type { PatientExplanation } from '@/lib/data/explanations'

type ReviewRole = 'clinic_admin' | 'radiologist' | 'super_admin'
const REVIEW_ROLES: ReviewRole[] = ['clinic_admin', 'radiologist', 'super_admin']

export type ExplanationResult = {
  error: string | null
  explanation?: PatientExplanation
}

// ─── generatePatientExplanation ───────────────────────────────────────────────
// Runs the local explanation engine against a finalized report and stores the
// result as a draft. No external AI calls are made.

export async function generatePatientExplanation(
  reportId: string,
  modality: string | null,
  bodyPart: string | null,
): Promise<ExplanationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to generate patient explanations.' }
  }

  const supabase = await createClient()

  const { data: report } = await supabase
    .from('reports')
    .select('id, clinic_id, study_id, patient_id, status, findings, impression, recommendations')
    .eq('id', reportId)
    .single()

  if (!report) return { error: 'Report not found.' }

  if (report.status !== 'finalized') {
    return { error: 'Patient explanations can only be generated for finalized reports.' }
  }

  const explanationText = generateExplanationText({
    findings:        (report.findings        as string) ?? '',
    impression:      (report.impression      as string) ?? '',
    recommendations: (report.recommendations as string) ?? '',
    modality,
    bodyPart,
  })

  const { data: inserted, error: insertError } = await supabase
    .from('patient_explanations')
    .insert({
      clinic_id:        report.clinic_id,
      report_id:        reportId,
      patient_id:       report.patient_id,
      study_id:         report.study_id,
      language:         'en',
      status:           'draft',
      explanation_text: explanationText,
      disclaimer:       STANDARD_DISCLAIMER,
      created_by:       user.id,
    })
    .select('*')
    .single()

  if (insertError || !inserted) return { error: 'Failed to create explanation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'patient_explanation.generated',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { explanationId: (inserted as Record<string, unknown>).id },
  })

  return { error: null, explanation: mapExplanationRow(inserted as Record<string, unknown>) }
}

// ─── approveExplanation ───────────────────────────────────────────────────────
// Saves the clinician-edited text and marks the explanation as approved.

export async function approveExplanation(
  explanationId: string,
  reportId: string,
  editedText: string,
): Promise<ExplanationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to approve patient explanations.' }
  }

  const text = editedText.trim()
  if (!text) return { error: 'Explanation text cannot be empty.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('patient_explanations')
    .update({
      status:           'approved',
      explanation_text: text,
      approved_by:      user.id,
      approved_at:      new Date().toISOString(),
    })
    .eq('id', explanationId)
    .eq('report_id', reportId)
    .in('status', ['draft', 'rejected'])
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to approve explanation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'patient_explanation.approved',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { explanationId },
  })

  return { error: null, explanation: mapExplanationRow(data as Record<string, unknown>) }
}

// ─── rejectExplanation ────────────────────────────────────────────────────────
// Marks a draft explanation as rejected with a mandatory reason.

export async function rejectExplanation(
  explanationId: string,
  reportId: string,
  reason: string,
): Promise<ExplanationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to reject patient explanations.' }
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'A rejection reason is required.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('patient_explanations')
    .update({
      status:           'rejected',
      rejected_by:      user.id,
      rejected_at:      new Date().toISOString(),
      rejection_reason: trimmedReason,
    })
    .eq('id', explanationId)
    .eq('report_id', reportId)
    .eq('status', 'draft')
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to reject explanation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'patient_explanation.rejected',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { explanationId, reason: trimmedReason },
  })

  return { error: null, explanation: mapExplanationRow(data as Record<string, unknown>) }
}

// ─── regenerateExplanation ────────────────────────────────────────────────────
// Archives the current explanation and immediately generates a new draft.
// Logs both archive and generate audit events.

export async function regenerateExplanation(
  currentExplanationId: string,
  reportId: string,
  modality: string | null,
  bodyPart: string | null,
): Promise<ExplanationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  // Archive the current explanation
  await supabase
    .from('patient_explanations')
    .update({ status: 'archived' })
    .eq('id', currentExplanationId)
    .eq('report_id', reportId)

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'patient_explanation.archived',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { explanationId: currentExplanationId },
  })

  // Generate a new draft
  return generatePatientExplanation(reportId, modality, bodyPart)
}
