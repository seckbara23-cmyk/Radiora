'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { mockStructureText } from '@/lib/ai/mock-engine'
import { parseStructuredText } from '@/lib/ai/hpd-engine'
import { evaluateReportWrite } from '@/lib/safety/immutability'
import { createReportVersion, type VersionDb } from '@/lib/reports/versioning'
import type { StructuredDraft } from '@/lib/ai/mock-engine'
import type { StructuredReportData } from '@/types/report'

type AiRole = 'clinic_admin' | 'radiologist' | 'super_admin'
const AI_ROLES: AiRole[] = ['clinic_admin', 'radiologist', 'super_admin']

export type GenerateResult = {
  error: string | null
  jobId?: string
  output?: StructuredDraft
}

export type HpdGenerateResult = {
  error: string | null
  jobId?: string
  output?: StructuredReportData
}

export type SimpleResult = { error: string | null }

// ─── generateStructuredDraft (legacy) ────────────────────────────────────────
// Kept for backward compatibility with the old SmartStructuringPanel.
// New code should use generateHPDDraft instead.

export async function generateStructuredDraft(
  reportId: string,
  freeText: string,
  modality: string | null,
  bodyPart: string | null,
): Promise<GenerateResult> {
  const user = await requireCurrentUser()

  if (!AI_ROLES.includes(user.role as AiRole)) {
    return { error: 'You do not have permission to use AI features.' }
  }

  const text = freeText.trim()
  if (!text) return { error: 'Please enter some clinical notes to structure.' }

  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from('ai_jobs')
    .insert({
      clinic_id:  user.clinicId,
      report_id:  reportId,
      provider:   'mock',
      model:      'local-structuring-v1',
      input_text: text,
      status:     'completed',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (jobError || !job) return { error: 'Failed to create AI job record.' }

  const output = mockStructureText(text, modality, bodyPart)

  const { error: outputError } = await supabase
    .from('ai_outputs')
    .insert({
      job_id:               job.id,
      clinic_id:            user.clinicId,
      report_id:            reportId,
      clinical_indication:  output.clinicalIndication,
      technique:            output.technique,
      findings:             output.findings,
      impression:           output.impression,
      recommendations:      output.recommendations,
    })

  if (outputError) return { error: 'Failed to store AI output.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'ai.draft_generated',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { provider: 'mock', jobId: job.id, modality, bodyPart },
  })

  return { error: null, jobId: job.id as string, output }
}

// ─── generateHPDDraft ─────────────────────────────────────────────────────────
// New HPD-format structuring engine.
// Input:  raw dictation / free text + exam context
// Output: StructuredReportData JSON following the HPD report template
// Rules:  French-first, never invents clinical findings, always requires review

export async function generateHPDDraft(
  reportId: string,
  freeText: string,
  modality: string | null,
  bodyPart: string | null,
): Promise<HpdGenerateResult> {
  const user = await requireCurrentUser()

  if (!AI_ROLES.includes(user.role as AiRole)) {
    return { error: 'You do not have permission to use AI features.' }
  }

  const text = freeText.trim()
  if (!text) return { error: 'Please enter some clinical notes to structure.' }

  const supabase = await createClient()

  // Fetch patient context so the PDF renderer has it ready
  const { data: reportRow } = await supabase
    .from('reports')
    .select('patient_id')
    .eq('id', reportId)
    .single()

  let patientName = '', patientAge = '', patientSex = ''
  if (reportRow?.patient_id) {
    const { data: p } = await supabase
      .from('patients')
      .select('first_name, last_name, date_of_birth, sex')
      .eq('id', reportRow.patient_id as string)
      .single()
    if (p) {
      patientName = `${(p.last_name as string ?? '').toUpperCase()} ${p.first_name as string ?? ''}`.trim()
      patientSex  = (p.sex as string) ?? ''
      if (p.date_of_birth) {
        const dob = new Date(p.date_of_birth as string)
        const now = new Date()
        const age = now.getFullYear() - dob.getFullYear() -
          (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate()) ? 1 : 0)
        patientAge = `${age} ans`
      }
    }
  }

  const { data: job, error: jobError } = await supabase
    .from('ai_jobs')
    .insert({
      clinic_id:  user.clinicId,
      report_id:  reportId,
      provider:   'mock',
      model:      'hpd-structuring-v1',
      input_text: text,
      status:     'completed',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (jobError || !job) return { error: 'Failed to create AI job record.' }

  const output = parseStructuredText(text, {
    modality,
    bodyPart,
    patientName,
    patientAge,
    patientSex,
    locale: 'fr',
  })

  await supabase.from('ai_outputs').insert({
    job_id:              job.id,
    clinic_id:           user.clinicId,
    report_id:           reportId,
    clinical_indication: output.indication,
    technique:           output.technique,
    findings:            output.results,
    impression:          output.conclusion,
    recommendations:     output.recommendations ?? null,
  })

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'ai.hpd_draft_generated',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { provider: 'mock', jobId: job.id, modality, bodyPart, examType: output.examType },
  })

  return { error: null, jobId: job.id as string, output }
}

// ─── acceptAiOutput (legacy) ──────────────────────────────────────────────────

export async function acceptAiOutput(
  jobId: string,
  reportId: string,
): Promise<SimpleResult> {
  const user = await requireCurrentUser()

  if (!AI_ROLES.includes(user.role as AiRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  const { data: report } = await supabase
    .from('reports')
    .select('findings, impression, recommendations, status, clinic_id, signed_at, structured_data')
    .eq('id', reportId)
    .single()

  // This legacy action records the review decision only — it never writes
  // report content — so a snapshot failure degrades with an audit entry
  // instead of blocking (R0.2: checked, not silent).
  if (report) {
    const snapshot = await createReportVersion(supabase as unknown as VersionDb, {
      reportId,
      clinicId:        report.clinic_id as string | null,
      findings:        (report.findings as string) ?? '',
      impression:      (report.impression as string) ?? '',
      recommendations: (report.recommendations as string | null) ?? null,
      structuredData:  report.structured_data ?? null,
      signedAt:        (report.signed_at as string | null) ?? null,
      status:          report.status as string,
      createdBy:       user.id,
      changeReason:    'Pre-AI-accept snapshot',
    })
    if (snapshot.error) {
      await logAudit({
        userId: user.id, clinicId: user.clinicId,
        action: 'report.version_snapshot_failed', entityType: 'report', entityId: reportId,
        metadata: { jobId, error: snapshot.error },
      })
    }
  }

  const { error: reviewError } = await supabase.from('ai_reviews').insert({
    job_id:      jobId,
    clinic_id:   user.clinicId,
    report_id:   reportId,
    decision:    'accepted',
    reviewer_id: user.id,
  })
  if (reviewError) return { error: reviewError.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'ai.draft_accepted',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { jobId },
  })

  return { error: null }
}

// ─── acceptHPDDraft ───────────────────────────────────────────────────────────
// Writes structured_data to the reports table immediately on accept (autosave).
// The radiologist still needs to explicitly save or finalize the report.

export async function acceptHPDDraft(
  jobId: string,
  reportId: string,
  structuredData: StructuredReportData,
): Promise<SimpleResult> {
  const user = await requireCurrentUser()

  if (!AI_ROLES.includes(user.role as AiRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('findings, impression, recommendations, status, clinic_id, signed_at, structured_data')
    .eq('id', reportId)
    .single()

  if (reportError || !report) return { error: 'Report not found.' }

  // R0.2 — a finalized report is immutable: an AI draft can never overwrite a
  // signed document. Route through the amendment workflow first.
  const gate = evaluateReportWrite({
    kind: 'ai_accept', currentStatus: report.status as string, actorRole: user.role,
  })
  if (!gate.allowed) return { error: gate.reason }

  // Snapshot current state before overwriting — abort if it cannot be preserved.
  const snapshot = await createReportVersion(supabase as unknown as VersionDb, {
    reportId,
    clinicId:        report.clinic_id as string | null,
    findings:        (report.findings as string) ?? '',
    impression:      (report.impression as string) ?? '',
    recommendations: (report.recommendations as string | null) ?? null,
    structuredData:  report.structured_data ?? null,
    signedAt:        (report.signed_at as string | null) ?? null,
    status:          report.status as string,
    createdBy:       user.id,
    changeReason:    'Pre-HPD-AI-accept snapshot',
  })
  if (snapshot.error) {
    return { error: `The report could not be snapshotted before applying the draft. ${snapshot.error}` }
  }

  // Autosave structured data + sync legacy columns for backward compat.
  // supabase-js does not throw — check the returned error explicitly (R0.2).
  const { error: updateError } = await supabase
    .from('reports')
    .update({
      structured_data: structuredData as unknown as Record<string, unknown>,
      exam_type:       structuredData.examType,
      findings:        structuredData.results,
      impression:      structuredData.conclusion,
      recommendations: structuredData.recommendations ?? null,
    })
    .eq('id', reportId)
  if (updateError) return { error: updateError.message }

  const { error: reviewError } = await supabase.from('ai_reviews').insert({
    job_id:      jobId,
    clinic_id:   user.clinicId,
    report_id:   reportId,
    decision:    'accepted',
    reviewer_id: user.id,
  })
  if (reviewError) {
    // The clinical write succeeded; record that the review bookkeeping failed.
    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'ai.review_record_failed', entityType: 'report', entityId: reportId,
      metadata: { jobId, error: reviewError.message },
    })
  }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'ai.hpd_draft_accepted',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { jobId, examType: structuredData.examType },
  })

  return { error: null }
}

// ─── rejectAiOutput ───────────────────────────────────────────────────────────

export async function rejectAiOutput(
  jobId: string,
  reportId: string,
): Promise<SimpleResult> {
  const user = await requireCurrentUser()

  if (!AI_ROLES.includes(user.role as AiRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  await supabase.from('ai_reviews').insert({
    job_id:      jobId,
    clinic_id:   user.clinicId,
    report_id:   reportId,
    decision:    'rejected',
    reviewer_id: user.id,
  })

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'ai.draft_rejected',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { jobId },
  })

  return { error: null }
}
