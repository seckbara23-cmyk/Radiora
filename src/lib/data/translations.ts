import { createClient } from '@/lib/supabase/server'

export type TranslationStatus = 'draft' | 'approved' | 'rejected' | 'archived'

export interface ReportTranslation {
  id:                    string
  clinicId:              string
  reportId:              string | null
  patientExplanationId:  string | null
  sourceLanguage:        string
  targetLanguage:        string
  status:                TranslationStatus
  translatedTitle:       string | null
  translatedFindings:    string | null
  translatedImpression:  string | null
  translatedRecommendations: string | null
  translatedExplanation: string | null
  disclaimer:            string | null
  sourceVersionId:       string | null
  createdBy:             string
  approvedBy:            string | null
  approvedAt:            string | null
  rejectedBy:            string | null
  rejectedAt:            string | null
  rejectionReason:       string | null
  createdAt:             string
  updatedAt:             string
}

export function mapTranslationRow(row: Record<string, unknown>): ReportTranslation {
  return {
    id:                       row.id as string,
    clinicId:                 row.clinic_id as string,
    reportId:                 (row.report_id as string | null) ?? null,
    patientExplanationId:     (row.patient_explanation_id as string | null) ?? null,
    sourceLanguage:           (row.source_language as string) ?? 'en',
    targetLanguage:           row.target_language as string,
    status:                   row.status as TranslationStatus,
    translatedTitle:          (row.translated_title as string | null) ?? null,
    translatedFindings:       (row.translated_findings as string | null) ?? null,
    translatedImpression:     (row.translated_impression as string | null) ?? null,
    translatedRecommendations:(row.translated_recommendations as string | null) ?? null,
    translatedExplanation:    (row.translated_explanation as string | null) ?? null,
    disclaimer:               (row.disclaimer as string | null) ?? null,
    sourceVersionId:          (row.source_version_id as string | null) ?? null,
    createdBy:                row.created_by as string,
    approvedBy:               (row.approved_by as string | null) ?? null,
    approvedAt:               (row.approved_at as string | null) ?? null,
    rejectedBy:               (row.rejected_by as string | null) ?? null,
    rejectedAt:               (row.rejected_at as string | null) ?? null,
    rejectionReason:          (row.rejection_reason as string | null) ?? null,
    createdAt:                row.created_at as string,
    updatedAt:                row.updated_at as string,
  }
}

// Returns the most recent non-archived translation for a report
export async function getTranslationByReport(
  reportId: string,
  targetLanguage = 'fr',
): Promise<ReportTranslation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('report_translations')
    .select('*')
    .eq('report_id', reportId)
    .eq('target_language', targetLanguage)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapTranslationRow(data as Record<string, unknown>) : null
}

// Returns the most recent non-archived translation for a patient explanation
export async function getTranslationByExplanation(
  explanationId: string,
  targetLanguage = 'fr',
): Promise<ReportTranslation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('report_translations')
    .select('*')
    .eq('patient_explanation_id', explanationId)
    .eq('target_language', targetLanguage)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapTranslationRow(data as Record<string, unknown>) : null
}
