'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { runStructuring } from '@/lib/ai/structuring-engine'
import { evaluateReportWrite } from '@/lib/safety/immutability'
import { createReportVersion, type VersionDb } from '@/lib/reports/versioning'
import type { StructuringResult } from '@/types/structuring'
import type { StructuredReportData } from '@/types/report'
import type { UserRole } from '@/types/user'

const STRUCTURE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']
// Pushing the structured draft into the clinical report is an editorial act on
// diagnostic content — radiologist ONLY (R0.2: the role gate now matches this
// contract via evaluateReportWrite kind 'structuring_accept').

function ageFromDob(dob: string): string {
  const d = new Date(dob)
  const now = new Date()
  const age = now.getFullYear() - d.getFullYear() -
    (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate()) ? 1 : 0)
  return `${age} ans`
}

export type StructureResult = { error: string | null; result?: StructuringResult }

// ─── structureTranscript ──────────────────────────────────────────────────────
// Runs the deterministic pipeline on the working transcript and stores the four
// layers (raw → cleaned → structured) + correction events + confidence.

export async function structureTranscript(itemId: string): Promise<StructureResult> {
  const user = await requireCurrentUser()
  if (!STRUCTURE_ROLES.includes(user.role)) return { error: 'You do not have permission to structure reports.' }
  if (!itemId) return { error: 'Missing queue item.' }

  const supabase = await createClient()

  const { data: trans } = await supabase
    .from('transcriptions')
    .select('id, raw_text, corrected_text')
    .eq('vacation_item_id', itemId)
    .maybeSingle()

  const source = ((trans?.corrected_text as string) || (trans?.raw_text as string) || '').trim()
  if (!source) return { error: 'There is no transcript text to structure yet.' }

  // Exam + patient context for the HPD header.
  const { data: item } = await supabase
    .from('vacation_items')
    .select('vacation_id, patient_id')
    .eq('id', itemId)
    .maybeSingle()

  let modality: string | null = null
  let bodyPart: string | null = null
  if (item?.vacation_id) {
    const { data: vac } = await supabase
      .from('vacations')
      .select('modality, title')
      .eq('id', item.vacation_id as string)
      .maybeSingle()
    modality = (vac?.modality as string | null) ?? null
    bodyPart = (vac?.title as string | null) ?? null // title often names the body region
  }

  let patientName = '', patientAge = '', patientSex = ''
  if (item?.patient_id) {
    const { data: p } = await supabase
      .from('patients')
      .select('first_name, last_name, date_of_birth, sex')
      .eq('id', item.patient_id as string)
      .maybeSingle()
    if (p) {
      patientName = `${(p.last_name as string ?? '').toUpperCase()} ${(p.first_name as string) ?? ''}`.trim()
      patientSex  = (p.sex as string) ?? ''
      if (p.date_of_birth) patientAge = ageFromDob(p.date_of_birth as string)
    }
  }

  const result = runStructuring({
    rawTranscript: source,
    modality,
    bodyPart,
    patientName,
    patientAge,
    patientSex,
    locale: 'fr',
  })

  // Persist the four layers + audit trail on the transcription row.
  const payload = {
    cleaned_text:      result.cleanedTranscript,
    correction_events: result.correctionEvents as unknown as Record<string, unknown>[],
    structured_json:   result.structured as unknown as Record<string, unknown>,
    confidence:        result.confidence as unknown as Record<string, unknown>[],
    structured_at:     new Date().toISOString(),
    structured_by:     user.id,
  }

  // R0.2 — supabase-js does not throw; check the returned error so a failed
  // persist is never reported as success.
  if (trans?.id) {
    const { error: persistError } = await supabase
      .from('transcriptions').update(payload).eq('id', trans.id as string)
    if (persistError) return { error: `Could not save the structuring result: ${persistError.message}` }
  } else {
    const { error: persistError } = await supabase.from('transcriptions').insert({
      clinic_id:        user.clinicId,
      vacation_item_id: itemId,
      raw_text:         source,
      created_by:       user.id,
      ...payload,
    })
    if (persistError) return { error: `Could not save the structuring result: ${persistError.message}` }
  }

  try {
    await logAudit({
      userId:     user.id,
      clinicId:   user.clinicId,
      action:     'structuring.generated',
      entityType: 'vacation_item',
      entityId:   itemId,
      metadata:   {
        corrections:    result.correctionEvents.length,
        removedTokens:  result.removedTokens.length,
        reviewRequired: result.reviewRequired,
        examType:       result.structured.examType,
      },
    })
  } catch {
    // Audit failures never block the operation.
  }

  return { error: null, result }
}

// ─── acceptStructuredReport ───────────────────────────────────────────────────
// Pushes the (radiologist-reviewed) structured draft into the linked report's
// structured_data. The radiologist still validates/signs separately.

export async function acceptStructuredReport(
  itemId: string,
  structured: StructuredReportData,
): Promise<{ error: string | null; reportId?: string }> {
  const user = await requireCurrentUser()

  // R0.2 — role pre-check (radiologist only) before any write.
  const roleGate = evaluateReportWrite({
    kind: 'structuring_accept', currentStatus: null, actorRole: user.role,
  })
  if (!roleGate.allowed) return { error: roleGate.reason }

  const supabase = await createClient()

  const { data: item, error: itemError } = await supabase
    .from('vacation_items')
    .select('report_id, clinic_id')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError || !item) return { error: 'Queue item not found.' }

  // Keep the approved draft on the transcription regardless.
  const { error: transError } = await supabase
    .from('transcriptions')
    .update({ structured_json: structured as unknown as Record<string, unknown> })
    .eq('vacation_item_id', itemId)
  if (transError) return { error: `Could not store the approved draft: ${transError.message}` }

  const reportId = item.report_id as string | null
  if (!reportId) {
    return { error: 'Match this item to a patient report first, then apply the structured draft.' }
  }

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('findings, impression, recommendations, status, clinic_id, signed_at, structured_data')
    .eq('id', reportId)
    .single()
  if (reportError || !report) return { error: 'Report not found.' }

  // R0.2 — a finalized report is immutable: route through the amendment flow.
  const statusGate = evaluateReportWrite({
    kind: 'structuring_accept', currentStatus: report.status as string, actorRole: user.role,
  })
  if (!statusGate.allowed) return { error: statusGate.reason }

  // Snapshot the report before overwriting — abort if it cannot be preserved.
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
    changeReason:    'Pre-structuring-accept snapshot',
  })
  if (snapshot.error) {
    return { error: `The report could not be snapshotted before applying the draft. ${snapshot.error}` }
  }

  const { error: updateError } = await supabase
    .from('reports')
    .update({
      structured_data: structured as unknown as Record<string, unknown>,
      exam_type:       structured.examType,
      findings:        structured.results,
      impression:      structured.conclusion,
      recommendations: structured.recommendations ?? null,
    })
    .eq('id', reportId)
  if (updateError) return { error: updateError.message }

  try {
    await logAudit({
      userId:     user.id,
      clinicId:   user.clinicId,
      action:     'structuring.accepted',
      entityType: 'report',
      entityId:   reportId,
      metadata:   { itemId, examType: structured.examType },
    })
  } catch {
    // ignore
  }

  return { error: null, reportId }
}
