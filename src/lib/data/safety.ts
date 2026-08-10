// Feature 10 — server loader for a report's safety context.
//
// Carries the structuring confidence and the raw/cleaned transcript to the
// signing gate and the safety panel. Reads through the user-session client, so
// RLS keeps it clinic-scoped.
//
// R2.2 — a transcript can now be owned by a report DIRECTLY, not only through a
// vacation queue item. Both are resolved here, report-owned first:
//
//   1. transcriptions.report_id = <report>            ← report-owned (R2.2)
//   2. report → vacation_items.report_id → transcriptions.vacation_item_id
//                                                     ← queue-owned (unchanged)
//
// Before R2.2 only path 2 existed, so a report created directly from a study
// could never surface AI review metadata at signing time. Nothing here weakens
// the gate: a missing transcript still returns null, and null is treated by
// evaluateSigningReadiness as "no AI metadata", never as high confidence.

import { createClient } from '@/lib/supabase/server'
import type { SectionConfidence } from '@/types/structuring'
import type { DictationOwnerKind } from '@/lib/dictation/owner'

export interface ReportSafetyContext {
  aiConfidence:       SectionConfidence[]
  rawTranscript:      string
  cleanedTranscript:  string
  /** Which ownership path supplied this context. Diagnostic only. */
  ownerKind:          DictationOwnerKind
}

interface TranscriptRow {
  confidence?:    unknown
  raw_text?:      string | null
  cleaned_text?:  string | null
}

function toContext(tr: TranscriptRow, ownerKind: DictationOwnerKind): ReportSafetyContext {
  return {
    aiConfidence: Array.isArray(tr.confidence) ? (tr.confidence as SectionConfidence[]) : [],
    rawTranscript: tr.raw_text ?? '',
    cleanedTranscript: tr.cleaned_text ?? '',
    ownerKind,
  }
}

const TRANSCRIPT_COLS = 'confidence, raw_text, cleaned_text'

/**
 * Structuring confidence + transcripts for a report, or null when the report has
 * no dictation at all. Best-effort: any failure resolves to null so callers
 * degrade rather than blocking clinical work.
 */
export async function getReportSafetyContext(reportId: string): Promise<ReportSafetyContext | null> {
  try {
    const supabase = await createClient()

    // 1. Report-owned transcript. Several dictation passes are allowed, so take
    //    the most recent — that is the one the radiologist just worked on.
    const { data: direct } = await supabase
      .from('transcriptions')
      .select(TRANSCRIPT_COLS)
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (direct) return toContext(direct as TranscriptRow, 'report')

    // 2. Queue-owned transcript, reached through the originating item.
    //    vacation_items_report_uidx (migration 044) makes this single-valued.
    const { data: item } = await supabase
      .from('vacation_items')
      .select('id')
      .eq('report_id', reportId)
      .maybeSingle()

    if (!item?.id) return null

    const { data: viaQueue } = await supabase
      .from('transcriptions')
      .select(TRANSCRIPT_COLS)
      .eq('vacation_item_id', item.id as string)
      .maybeSingle()

    if (!viaQueue) return null
    return toContext(viaQueue as TranscriptRow, 'vacation_item')
  } catch {
    return null
  }
}
