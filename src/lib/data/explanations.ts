import { createClient } from '@/lib/supabase/server'

export type ExplanationStatus = 'draft' | 'approved' | 'rejected' | 'archived'

export interface PatientExplanation {
  id:                    string
  clinicId:              string
  reportId:              string
  patientId:             string
  studyId:               string
  language:              string
  status:                ExplanationStatus
  sourceReportVersionId: string | null
  explanationText:       string
  disclaimer:            string
  createdBy:             string
  approvedBy:            string | null
  approvedAt:            string | null
  rejectedBy:            string | null
  rejectedAt:            string | null
  rejectionReason:       string | null
  createdAt:             string
  updatedAt:             string
}

export function mapExplanationRow(row: Record<string, unknown>): PatientExplanation {
  return {
    id:                    row.id as string,
    clinicId:              row.clinic_id as string,
    reportId:              row.report_id as string,
    patientId:             row.patient_id as string,
    studyId:               row.study_id as string,
    language:              (row.language as string) ?? 'en',
    status:                row.status as ExplanationStatus,
    sourceReportVersionId: (row.source_report_version_id as string | null) ?? null,
    explanationText:       row.explanation_text as string,
    disclaimer:            row.disclaimer as string,
    createdBy:             row.created_by as string,
    approvedBy:            (row.approved_by as string | null) ?? null,
    approvedAt:            (row.approved_at as string | null) ?? null,
    rejectedBy:            (row.rejected_by as string | null) ?? null,
    rejectedAt:            (row.rejected_at as string | null) ?? null,
    rejectionReason:       (row.rejection_reason as string | null) ?? null,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  }
}

// Returns the most recent non-archived explanation for a report, or null
export async function getExplanationByReport(
  reportId: string,
): Promise<PatientExplanation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patient_explanations')
    .select('*')
    .eq('report_id', reportId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapExplanationRow(data as Record<string, unknown>) : null
}
