'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import {
  mapExternalAiResultRow,
  mapExternalAiFindingRow,
} from '@/lib/data/external-ai'
import type { ExternalAiResult, ExternalAiFinding } from '@/lib/data/external-ai'
import { createReportVersion, type VersionDb } from '@/lib/reports/versioning'
import {
  buildExternalAiBlock,
  applyExternalAiFindings,
  type AcceptedFinding,
} from '@/lib/reports/external-ai-apply'
import type { StructuredReportData } from '@/types/report'

type ManageRole = 'clinic_admin' | 'radiologist' | 'super_admin'
const MANAGE_ROLES: ManageRole[] = ['clinic_admin', 'radiologist', 'super_admin']

export type ExternalAiActionResult = {
  error: string | null
  result?: ExternalAiResult
  findings?: ExternalAiFinding[]
}

export type FindingActionResult = {
  error: string | null
  finding?: ExternalAiFinding
}

export type SimpleActionResult = {
  error: string | null
}

export interface FindingInput {
  findingLabel:   string
  bodyRegion?:    string
  laterality?:    string
  confidence?:    number | null
  severity?:      string
  recommendation?: string
}

export interface ImportInput {
  studyId:           string
  reportId?:         string | null
  sourceType:        string
  vendorName?:       string
  modelName?:        string
  modelVersion?:     string
  overallConfidence?: number | null
  summaryText?:      string
  findings:          FindingInput[]
}

// ─── importExternalAiResult ───────────────────────────────────────────────────
// Persists a new external AI result and its findings.
// raw_payload stores a snapshot of the submitted data for audit/provenance.

export async function importExternalAiResult(
  input: ImportInput,
): Promise<ExternalAiActionResult> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'You do not have permission to import external AI results.' }
  }

  if (!input.studyId) return { error: 'Study ID is required.' }
  if (!input.findings || input.findings.length === 0) {
    return { error: 'At least one finding is required.' }
  }

  const supabase = await createClient()

  const { data: study } = await supabase
    .from('studies')
    .select('id, clinic_id')
    .eq('id', input.studyId)
    .single()

  if (!study) return { error: 'Study not found.' }

  const rawPayload = {
    sourceType:        input.sourceType,
    vendorName:        input.vendorName ?? null,
    modelName:         input.modelName ?? null,
    modelVersion:      input.modelVersion ?? null,
    overallConfidence: input.overallConfidence ?? null,
    summaryText:       input.summaryText ?? null,
    findings:          input.findings,
    importedAt:        new Date().toISOString(),
    importedBy:        user.id,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('external_ai_results')
    .insert({
      clinic_id:         user.clinicId,
      study_id:          input.studyId,
      report_id:         input.reportId ?? null,
      source_type:       input.sourceType,
      vendor_name:       input.vendorName ?? null,
      model_name:        input.modelName ?? null,
      model_version:     input.modelVersion ?? null,
      status:            'imported',
      overall_confidence: input.overallConfidence ?? null,
      raw_payload:       rawPayload,
      summary_text:      input.summaryText ?? null,
      created_by:        user.id,
    })
    .select('*')
    .single()

  if (insertError || !inserted) return { error: 'Failed to save external AI result.' }

  const resultId = (inserted as Record<string, unknown>).id as string

  const findingRows = input.findings
    .filter((f) => f.findingLabel.trim())
    .map((f) => ({
      clinic_id:              user.clinicId,
      external_ai_result_id:  resultId,
      study_id:               input.studyId,
      finding_label:          f.findingLabel.trim(),
      body_region:            f.bodyRegion?.trim() || null,
      laterality:             f.laterality || null,
      confidence:             f.confidence ?? null,
      severity:               f.severity || null,
      recommendation:         f.recommendation?.trim() || null,
    }))

  const { data: insertedFindings, error: findingsError } = await supabase
    .from('external_ai_findings')
    .insert(findingRows)
    .select('*')

  if (findingsError) return { error: 'Failed to save findings.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'external_ai.imported',
    entityType: 'study',
    entityId:   input.studyId,
    metadata:   {
      resultId,
      sourceType:    input.sourceType,
      vendorName:    input.vendorName ?? null,
      modelName:     input.modelName ?? null,
      findingsCount: findingRows.length,
    },
  })

  return {
    error:    null,
    result:   mapExternalAiResultRow(inserted as Record<string, unknown>),
    findings: (insertedFindings ?? []).map((f) =>
      mapExternalAiFindingRow(f as Record<string, unknown>),
    ),
  }
}

// ─── reviewExternalAiResult ───────────────────────────────────────────────────
// Marks the overall result as reviewed (clinician has looked at all findings).

export async function reviewExternalAiResult(
  resultId: string,
  studyId:  string,
): Promise<ExternalAiActionResult> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'You do not have permission to review external AI results.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('external_ai_results')
    .update({
      status:      'reviewed',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', resultId)
    .eq('status', 'imported')
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to mark result as reviewed.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'external_ai.reviewed',
    entityType: 'study',
    entityId:   studyId,
    metadata:   { resultId },
  })

  return { error: null, result: mapExternalAiResultRow(data as Record<string, unknown>) }
}

// ─── acceptFinding ────────────────────────────────────────────────────────────

export async function acceptFinding(
  findingId: string,
  resultId:  string,
  studyId:   string,
): Promise<FindingActionResult> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'You do not have permission to accept findings.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('external_ai_findings')
    .update({
      accepted:    true,
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
    })
    .eq('id', findingId)
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to accept finding.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'external_ai.finding_accepted',
    entityType: 'study',
    entityId:   studyId,
    metadata:   { findingId, resultId },
  })

  return { error: null, finding: mapExternalAiFindingRow(data as Record<string, unknown>) }
}

// ─── rejectFinding ────────────────────────────────────────────────────────────

export async function rejectFinding(
  findingId: string,
  resultId:  string,
  studyId:   string,
  reason:    string,
): Promise<FindingActionResult> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'You do not have permission to reject findings.' }
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'A rejection reason is required.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('external_ai_findings')
    .update({
      accepted:         null,
      accepted_by:      null,
      accepted_at:      null,
      rejected_by:      user.id,
      rejected_at:      new Date().toISOString(),
      rejection_reason: trimmedReason,
    })
    .eq('id', findingId)
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to reject finding.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'external_ai.finding_rejected',
    entityType: 'study',
    entityId:   studyId,
    metadata:   { findingId, resultId, reason: trimmedReason },
  })

  return { error: null, finding: mapExternalAiFindingRow(data as Record<string, unknown>) }
}

// ─── archiveExternalAiResult ──────────────────────────────────────────────────

export async function archiveExternalAiResult(
  resultId: string,
  studyId:  string,
): Promise<SimpleActionResult> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'You do not have permission to archive external AI results.' }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('external_ai_results')
    .update({ status: 'archived' })
    .eq('id', resultId)

  if (error) return { error: 'Failed to archive result.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'external_ai.archived',
    entityType: 'study',
    entityId:   studyId,
    metadata:   { resultId },
  })

  return { error: null }
}

// ─── applyAcceptedFindingsToReport ────────────────────────────────────────────
// Appends accepted findings as suggestion text to the report's findings field.
// Creates a version snapshot first so the pre-edit state is preserved.
// Does NOT finalize the report — the clinician still owns all changes.

export async function applyAcceptedFindingsToReport(
  resultId:  string,
  reportId:  string,
  studyId:   string,
): Promise<SimpleActionResult> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'You do not have permission to modify reports.' }
  }

  const supabase = await createClient()

  // R2.6 — every Supabase result is checked. supabase-js does not throw; it
  // returns { error }, and the previous version of this action ignored all of
  // them, so a failed read looked identical to "report not found".
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id, clinic_id, status, findings, impression, recommendations, structured_data')
    .eq('id', reportId)
    .single()

  if (reportError) return { error: 'Could not load the report.' }
  if (!report) return { error: 'Report not found.' }

  if (report.status === 'finalized') {
    return { error: 'Cannot modify a finalized report. Amend it first.' }
  }

  const { data: findings, error: findingsError } = await supabase
    .from('external_ai_findings')
    .select('*')
    .eq('external_ai_result_id', resultId)
    .eq('accepted', true)
    .order('created_at', { ascending: true })

  if (findingsError) return { error: 'Could not load the accepted findings.' }
  if (!findings || findings.length === 0) {
    return { error: 'No accepted findings to apply.' }
  }

  const { data: aiResult, error: aiResultError } = await supabase
    .from('external_ai_results')
    .select('vendor_name, model_name, model_version')
    .eq('id', resultId)
    .single()

  if (aiResultError) return { error: 'Could not load the external AI result.' }

  const block = buildExternalAiBlock(
    (aiResult?.vendor_name as string | null) ?? 'Unknown Vendor',
    (aiResult?.model_name  as string | null) ?? 'Unknown Model',
    (aiResult?.model_version as string | null) ?? null,
    findings as AcceptedFinding[],
  )

  // R2.6 — write the CANONICAL model. A structured report keeps its content in
  // structured_data, which is what the editor, PDF, DOCX, print and delivery
  // all read; writing only the legacy column made accepted findings invisible
  // everywhere while the action reported success.
  const currentStructured = (report.structured_data as StructuredReportData | null) ?? null
  const applied = applyExternalAiFindings({
    structuredData:  currentStructured,
    findings:        report.findings as string | null,
    impression:      report.impression as string | null,
    recommendations: report.recommendations as string | null,
    block,
  })

  // Pre-edit snapshot through the shared R0.2 writer: it carries clinic_id and
  // structured_data, checks the returned error, and retries a version-number
  // race. The hand-rolled insert here did none of that.
  const snapshot = await createReportVersion(supabase as unknown as VersionDb, {
    reportId,
    clinicId:        (report.clinic_id as string | null) ?? user.clinicId,
    findings:        (report.findings as string | null) ?? '',
    impression:      (report.impression as string | null) ?? '',
    recommendations: (report.recommendations as string | null) ?? null,
    structuredData:  currentStructured,
    status:          report.status as string,
    createdBy:       user.id,
    action:          'saved',
    changeReason:    'Pre-edit snapshot: External AI findings applied',
  })
  if (snapshot.error) return { error: snapshot.error }

  const { error: updateError } = await supabase
    .from('reports')
    .update({
      findings: applied.findings,
      ...(applied.structuredData ? { structured_data: applied.structuredData } : {}),
    })
    .eq('id', reportId)

  if (updateError) return { error: 'Failed to update report.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'report.external_ai_applied',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { resultId, studyId, findingsApplied: findings.length },
  })

  return { error: null }
}
