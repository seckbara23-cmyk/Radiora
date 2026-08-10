import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MobileDictationContext } from '@/types/dictation'

/**
 * Resolves the minimal context for the PUBLIC, tokenized phone page.
 *
 * Uses the service-role client because the phone is not authenticated — the
 * unguessable token is the capability. We intentionally surface only low-PHI
 * fields (the fallback patient *label*, exam number, modality) and never the
 * matched patient's real name.
 */
export async function getMobileContext(token: string): Promise<MobileDictationContext> {
  if (!token) return { valid: false, reason: 'not_found' }

  let supabase
  try {
    supabase = createAdminClient()
  } catch {
    // Service-role key not configured in this environment.
    return { valid: false, reason: 'not_found' }
  }

  const { data: session } = await supabase
    .from('dictation_sessions')
    .select('id, vacation_item_id, report_id, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!session) return { valid: false, reason: 'not_found' }
  if (session.status === 'completed') return { valid: false, reason: 'completed' }
  if (session.status === 'cancelled' || session.status === 'expired') {
    return { valid: false, reason: 'expired' }
  }
  if (new Date(session.expires_at as string).getTime() < Date.now()) {
    return { valid: false, reason: 'expired' }
  }

  // R2.2 — a session belongs to a report OR a queue item. Either way the phone
  // sees only enough to confirm it is dictating the right examination: exam
  // type/number and modality. Never the patient's name, never report content,
  // never history or demographics.
  if (session.report_id) {
    const { data: report } = await supabase
      .from('reports')
      .select('exam_type, study_id')
      .eq('id', session.report_id as string)
      .maybeSingle()

    let modality: string | undefined
    let examNumber: string | undefined
    if (report?.study_id) {
      const { data: study } = await supabase
        .from('studies')
        .select('modality, accession_number')
        .eq('id', report.study_id as string)
        .maybeSingle()
      modality   = (study?.modality as string) ?? undefined
      examNumber = (study?.accession_number as string) ?? undefined
    }

    return {
      valid:         true,
      examNumber,
      modality,
      vacationTitle: (report?.exam_type as string | null) ?? undefined,
    }
  }

  const { data: item } = await supabase
    .from('vacation_items')
    .select('patient_label, exam_number, vacation_id')
    .eq('id', session.vacation_item_id as string)
    .maybeSingle()

  let vacationTitle: string | undefined
  let modality: string | undefined
  if (item?.vacation_id) {
    const { data: vac } = await supabase
      .from('vacations')
      .select('title, modality')
      .eq('id', item.vacation_id as string)
      .maybeSingle()
    vacationTitle = (vac?.title as string) ?? undefined
    modality = (vac?.modality as string) ?? undefined
  }

  return {
    valid:         true,
    patientLabel:  (item?.patient_label as string | null) ?? undefined,
    examNumber:    (item?.exam_number as string | null) ?? undefined,
    modality,
    vacationTitle,
  }
}
