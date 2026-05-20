import { createClient } from '@/lib/supabase/server'

export type ExternalAiStatus     = 'imported' | 'reviewed' | 'accepted' | 'rejected' | 'archived'
export type ExternalAiSourceType = 'dicom_sr' | 'vendor_json' | 'manual_entry' | 'future_pacs_integration'
export type FindingSeverity       = 'low' | 'moderate' | 'high' | 'critical'

export interface ExternalAiResult {
  id:                string
  clinicId:          string
  studyId:           string
  reportId:          string | null
  sourceType:        ExternalAiSourceType
  vendorName:        string | null
  modelName:         string | null
  modelVersion:      string | null
  status:            ExternalAiStatus
  overallConfidence: number | null
  rawPayload:        Record<string, unknown>
  summaryText:       string | null
  createdBy:         string
  reviewedBy:        string | null
  reviewedAt:        string | null
  rejectionReason:   string | null
  createdAt:         string
  updatedAt:         string
}

export interface ExternalAiFinding {
  id:                  string
  clinicId:            string
  externalAiResultId:  string
  studyId:             string
  findingType:         string | null
  findingLabel:        string
  bodyRegion:          string | null
  laterality:          string | null
  confidence:          number | null
  severity:            FindingSeverity | null
  recommendation:      string | null
  accepted:            boolean | null
  acceptedBy:          string | null
  acceptedAt:          string | null
  rejectedBy:          string | null
  rejectedAt:          string | null
  rejectionReason:     string | null
  createdAt:           string
  updatedAt:           string
}

export function mapExternalAiResultRow(row: Record<string, unknown>): ExternalAiResult {
  return {
    id:                row.id as string,
    clinicId:          row.clinic_id as string,
    studyId:           row.study_id as string,
    reportId:          (row.report_id as string | null) ?? null,
    sourceType:        row.source_type as ExternalAiSourceType,
    vendorName:        (row.vendor_name as string | null) ?? null,
    modelName:         (row.model_name as string | null) ?? null,
    modelVersion:      (row.model_version as string | null) ?? null,
    status:            row.status as ExternalAiStatus,
    overallConfidence: (row.overall_confidence as number | null) ?? null,
    rawPayload:        (row.raw_payload as Record<string, unknown>) ?? {},
    summaryText:       (row.summary_text as string | null) ?? null,
    createdBy:         row.created_by as string,
    reviewedBy:        (row.reviewed_by as string | null) ?? null,
    reviewedAt:        (row.reviewed_at as string | null) ?? null,
    rejectionReason:   (row.rejection_reason as string | null) ?? null,
    createdAt:         row.created_at as string,
    updatedAt:         row.updated_at as string,
  }
}

export function mapExternalAiFindingRow(row: Record<string, unknown>): ExternalAiFinding {
  return {
    id:                 row.id as string,
    clinicId:           row.clinic_id as string,
    externalAiResultId: row.external_ai_result_id as string,
    studyId:            row.study_id as string,
    findingType:        (row.finding_type as string | null) ?? null,
    findingLabel:       row.finding_label as string,
    bodyRegion:         (row.body_region as string | null) ?? null,
    laterality:         (row.laterality as string | null) ?? null,
    confidence:         (row.confidence as number | null) ?? null,
    severity:           (row.severity as FindingSeverity | null) ?? null,
    recommendation:     (row.recommendation as string | null) ?? null,
    accepted:           (row.accepted as boolean | null) ?? null,
    acceptedBy:         (row.accepted_by as string | null) ?? null,
    acceptedAt:         (row.accepted_at as string | null) ?? null,
    rejectedBy:         (row.rejected_by as string | null) ?? null,
    rejectedAt:         (row.rejected_at as string | null) ?? null,
    rejectionReason:    (row.rejection_reason as string | null) ?? null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
  }
}

export interface ExternalAiResultWithFindings {
  result:   ExternalAiResult
  findings: ExternalAiFinding[]
}

export async function getExternalAiResultsByStudy(
  studyId: string,
): Promise<ExternalAiResultWithFindings[]> {
  const supabase = await createClient()

  const { data: results } = await supabase
    .from('external_ai_results')
    .select('*')
    .eq('study_id', studyId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (!results || results.length === 0) return []

  const resultIds = results.map((r) => r.id as string)

  const { data: findings } = await supabase
    .from('external_ai_findings')
    .select('*')
    .in('external_ai_result_id', resultIds)
    .order('created_at', { ascending: true })

  const findingsByResultId: Record<string, ExternalAiFinding[]> = {}
  for (const f of findings ?? []) {
    const rid = f.external_ai_result_id as string
    if (!findingsByResultId[rid]) findingsByResultId[rid] = []
    findingsByResultId[rid].push(mapExternalAiFindingRow(f as Record<string, unknown>))
  }

  return results.map((r) => ({
    result:   mapExternalAiResultRow(r as Record<string, unknown>),
    findings: findingsByResultId[r.id as string] ?? [],
  }))
}
