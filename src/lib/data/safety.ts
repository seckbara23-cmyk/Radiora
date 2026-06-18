// Feature 10 — server loader for a report's safety context.
//
// Bridges a report to its originating dictation: report_id lives on the vacation
// queue item, whose transcription carries the latest structuring confidence and
// the raw/cleaned transcript. Used by the signing gate and the safety panel.
// Reads through the user-session client, so RLS keeps it clinic-scoped.

import { createClient } from '@/lib/supabase/server'
import type { SectionConfidence } from '@/types/structuring'

export interface ReportSafetyContext {
  aiConfidence:       SectionConfidence[]
  rawTranscript:      string
  cleanedTranscript:  string
}

/**
 * Returns the structuring confidence + transcripts linked to a report, or null
 * when the report did not originate from a dictation queue item (e.g. a report
 * authored directly). Best-effort: any failure resolves to null so callers
 * degrade gracefully rather than blocking clinical work.
 */
export async function getReportSafetyContext(reportId: string): Promise<ReportSafetyContext | null> {
  try {
    const supabase = await createClient()

    const { data: item } = await supabase
      .from('vacation_items')
      .select('id')
      .eq('report_id', reportId)
      .maybeSingle()

    if (!item?.id) return null

    const { data: tr } = await supabase
      .from('transcriptions')
      .select('confidence, raw_text, cleaned_text')
      .eq('vacation_item_id', item.id as string)
      .maybeSingle()

    if (!tr) return null

    const confidence = Array.isArray(tr.confidence)
      ? (tr.confidence as unknown as SectionConfidence[])
      : []

    return {
      aiConfidence:      confidence,
      rawTranscript:     (tr.raw_text as string | null) ?? '',
      cleanedTranscript: (tr.cleaned_text as string | null) ?? '',
    }
  } catch {
    return null
  }
}
