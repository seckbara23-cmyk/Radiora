'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { mockStructureText } from '@/lib/ai/mock-engine'
import type { StructuredDraft } from '@/lib/ai/mock-engine'

type AiRole = 'clinic_admin' | 'radiologist' | 'super_admin'
const AI_ROLES: AiRole[] = ['clinic_admin', 'radiologist', 'super_admin']

export type GenerateResult = {
  error: string | null
  jobId?: string
  output?: StructuredDraft
}

export type SimpleResult = { error: string | null }

// ─── generateStructuredDraft ──────────────────────────────────────────────────
// Runs the mock structuring engine, stores the job + output records, and
// returns the structured draft to the client for clinician review.
// No real AI provider is called — provider = 'mock'.

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

// ─── acceptAiOutput ───────────────────────────────────────────────────────────
// Records the accept decision and creates a version snapshot of the report's
// current state (before AI content is applied) so it is always recoverable.
// The AI content is applied client-side; the clinician must still save/finalize.

export async function acceptAiOutput(
  jobId: string,
  reportId: string,
): Promise<SimpleResult> {
  const user = await requireCurrentUser()

  if (!AI_ROLES.includes(user.role as AiRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  // Snapshot the report's current state before the AI content is merged in
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
