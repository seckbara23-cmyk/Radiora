'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { translateText, translateDisclaimer } from '@/lib/ai/translation-engine'
import type { TranslationLang } from '@/lib/ai/translation-engine'
import { mapTranslationRow } from '@/lib/data/translations'
import type { ReportTranslation } from '@/lib/data/translations'

type ReviewRole = 'clinic_admin' | 'radiologist' | 'super_admin'
const REVIEW_ROLES: ReviewRole[] = ['clinic_admin', 'radiologist', 'super_admin']

export type TranslationResult = {
  error: string | null
  translation?: ReportTranslation
}

// ─── generateReportTranslation ────────────────────────────────────────────────
// Translates a finalized report's clinical fields. No external calls.

export async function generateReportTranslation(
  reportId: string,
  targetLanguage: string,
): Promise<TranslationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to generate translations.' }
  }

  const from = 'en' as TranslationLang
  const to   = targetLanguage as TranslationLang

  const supabase = await createClient()

  const { data: report } = await supabase
    .from('reports')
    .select('id, clinic_id, status, findings, impression, recommendations')
    .eq('id', reportId)
    .single()

  if (!report) return { error: 'Report not found.' }

  if (report.status !== 'finalized') {
    return { error: 'Only finalized reports can be translated.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('report_translations')
    .insert({
      clinic_id:                  report.clinic_id,
      report_id:                  reportId,
      source_language:            from,
      target_language:            to,
      status:                     'draft',
      translated_findings:        translateText((report.findings        as string) ?? '', from, to),
      translated_impression:      translateText((report.impression      as string) ?? '', from, to),
      translated_recommendations: translateText((report.recommendations as string) ?? '', from, to),
      created_by:                 user.id,
    })
    .select('*')
    .single()

  if (insertError || !inserted) return { error: 'Failed to create translation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'translation.generated',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { translationId: (inserted as Record<string, unknown>).id, targetLanguage },
  })

  return { error: null, translation: mapTranslationRow(inserted as Record<string, unknown>) }
}

// ─── generateExplanationTranslation ──────────────────────────────────────────
// Translates an approved patient explanation. No external calls.

export async function generateExplanationTranslation(
  explanationId: string,
  reportId: string,
  targetLanguage: string,
): Promise<TranslationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to generate translations.' }
  }

  const from = 'en' as TranslationLang
  const to   = targetLanguage as TranslationLang

  const supabase = await createClient()

  const { data: explanation } = await supabase
    .from('patient_explanations')
    .select('id, clinic_id, status, explanation_text, disclaimer')
    .eq('id', explanationId)
    .single()

  if (!explanation) return { error: 'Patient explanation not found.' }

  if (explanation.status !== 'approved') {
    return { error: 'Only approved patient explanations can be translated.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('report_translations')
    .insert({
      clinic_id:              explanation.clinic_id,
      patient_explanation_id: explanationId,
      source_language:        from,
      target_language:        to,
      status:                 'draft',
      translated_explanation: translateText((explanation.explanation_text as string) ?? '', from, to),
      disclaimer:             translateDisclaimer(from, to),
      created_by:             user.id,
    })
    .select('*')
    .single()

  if (insertError || !inserted) return { error: 'Failed to create translation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'translation.generated',
    entityType: 'report',
    entityId:   reportId,
    metadata:   {
      translationId:    (inserted as Record<string, unknown>).id,
      explanationId,
      targetLanguage,
    },
  })

  return { error: null, translation: mapTranslationRow(inserted as Record<string, unknown>) }
}

// ─── approveTranslation ───────────────────────────────────────────────────────
// Saves clinician-edited translated content and marks the translation approved.

export async function approveTranslation(
  translationId: string,
  reportId: string,
  content: {
    findings?:        string
    impression?:      string
    recommendations?: string
    explanation?:     string
  },
): Promise<TranslationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to approve translations.' }
  }

  const updates: Record<string, unknown> = {
    status:      'approved',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  }

  if (content.findings        !== undefined) updates.translated_findings        = content.findings
  if (content.impression      !== undefined) updates.translated_impression      = content.impression
  if (content.recommendations !== undefined) updates.translated_recommendations = content.recommendations
  if (content.explanation     !== undefined) updates.translated_explanation     = content.explanation

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('report_translations')
    .update(updates)
    .eq('id', translationId)
    .in('status', ['draft', 'rejected'])
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to approve translation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'translation.approved',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { translationId },
  })

  return { error: null, translation: mapTranslationRow(data as Record<string, unknown>) }
}

// ─── rejectTranslation ────────────────────────────────────────────────────────

export async function rejectTranslation(
  translationId: string,
  reportId: string,
  reason: string,
): Promise<TranslationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to reject translations.' }
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'A rejection reason is required.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('report_translations')
    .update({
      status:           'rejected',
      rejected_by:      user.id,
      rejected_at:      new Date().toISOString(),
      rejection_reason: trimmedReason,
    })
    .eq('id', translationId)
    .eq('status', 'draft')
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to reject translation.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'translation.rejected',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { translationId, reason: trimmedReason },
  })

  return { error: null, translation: mapTranslationRow(data as Record<string, unknown>) }
}

// ─── regenerateReportTranslation ──────────────────────────────────────────────
// Archives current translation and immediately generates a fresh draft.

export async function regenerateReportTranslation(
  currentTranslationId: string,
  reportId: string,
  targetLanguage: string,
): Promise<TranslationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  await supabase
    .from('report_translations')
    .update({ status: 'archived' })
    .eq('id', currentTranslationId)

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'translation.archived',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { translationId: currentTranslationId },
  })

  return generateReportTranslation(reportId, targetLanguage)
}

// ─── regenerateExplanationTranslation ────────────────────────────────────────

export async function regenerateExplanationTranslation(
  currentTranslationId: string,
  explanationId: string,
  reportId: string,
  targetLanguage: string,
): Promise<TranslationResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission.' }
  }

  const supabase = await createClient()

  await supabase
    .from('report_translations')
    .update({ status: 'archived' })
    .eq('id', currentTranslationId)

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'translation.archived',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { translationId: currentTranslationId, explanationId },
  })

  return generateExplanationTranslation(explanationId, reportId, targetLanguage)
}
