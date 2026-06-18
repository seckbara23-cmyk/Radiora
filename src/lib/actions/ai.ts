'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { mockStructureText } from '@/lib/ai/mock-engine'
import { parseStructuredText } from '@/lib/ai/hpd-engine'
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
    .select('findings, impression, recommendations, status, clinic_id')
    .eq('id', reportId)
    .single()

  if (report) {
    try {
      const { data: maxRow } = await supabase
        .from('report_versions')
        .select('version_number')
        .eq('report_id', reportId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const versionNumber = ((maxRow?.version_number as number | null) ?? 0) + 1

      await supabase.from('report_versions').insert({
        report_id:       reportId,
        clinic_id:       report.clinic_id,
        version_number:  versionNumber,
        findings:        report.findings,
        impression:      report.impression,
        recommendations: report.recommendations,
        status:          report.status,
        created_by:      user.id,
        change_reason:   'Pre-AI-accept snapshot',
      })
    } catch {
      // Version failures must never block the primary clinical operation.
    }
  }

  await supabase.from('ai_reviews').insert({
    job_id:      jobId,
    clinic_id:   user.clinicId,
    report_id:   reportId,
    decision:    'accepted',
    reviewer_id: user.id,
  })

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

  // Snapshot current state before overwriting
  const { data: report } = await supabase
    .from('reports')
    .select('findings, impression, recommendations, status, clinic_id')
    .eq('id', reportId)
    .single()

  if (report) {
    try {
      const { data: maxRow } = await supabase
        .from('report_versions')
        .select('version_number')
        .eq('report_id', reportId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const versionNumber = ((maxRow?.version_number as number | null) ?? 0) + 1

      await supabase.from('report_versions').insert({
        report_id:       reportId,
        clinic_id:       report.clinic_id,
        version_number:  versionNumber,
        findings:        report.findings,
        impression:      report.impression,
        recommendations: report.recommendations,
        status:          report.status,
        created_by:      user.id,
        change_reason:   'Pre-HPD-AI-accept snapshot',
      })
    } catch {
      // Version failures must never block the primary clinical operation.
    }
  }

  // Autosave structured data + sync legacy columns for backward compat
  await supabase
    .from('reports')
    .update({
      structured_data: structuredData as unknown as Record<string, unknown>,
      exam_type:       structuredData.examType,
      findings:        structuredData.results,
      impression:      structuredData.conclusion,
      recommendations: structuredData.recommendations ?? null,
    })
    .eq('id', reportId)

  await supabase.from('ai_reviews').insert({
    job_id:      jobId,
    clinic_id:   user.clinicId,
    report_id:   reportId,
    decision:    'accepted',
    reviewer_id: user.id,
  })

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
