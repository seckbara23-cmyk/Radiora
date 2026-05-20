import { createClient } from '@/lib/supabase/server'

export type TranscriptStatus = 'recorded' | 'transcribed' | 'reviewed' | 'rejected' | 'archived'
export type TranscriptSource = 'mock_local' | 'browser_speech_api' | 'future_external_provider'

export interface VoiceTranscript {
  id:                   string
  clinicId:             string
  reportId:             string | null
  studyId:              string | null
  patientId:            string | null
  language:             string
  transcriptStatus:     TranscriptStatus
  transcriptText:       string
  transcriptSource:     TranscriptSource
  audioDurationSeconds: number | null
  createdBy:            string
  reviewedBy:           string | null
  reviewedAt:           string | null
  rejectionReason:      string | null
  createdAt:            string
  updatedAt:            string
}

export function mapVoiceTranscriptRow(row: Record<string, unknown>): VoiceTranscript {
  return {
    id:                   row.id as string,
    clinicId:             row.clinic_id as string,
    reportId:             (row.report_id as string | null) ?? null,
    studyId:              (row.study_id as string | null) ?? null,
    patientId:            (row.patient_id as string | null) ?? null,
    language:             row.language as string,
    transcriptStatus:     row.transcript_status as TranscriptStatus,
    transcriptText:       row.transcript_text as string,
    transcriptSource:     row.transcript_source as TranscriptSource,
    audioDurationSeconds: (row.audio_duration_seconds as number | null) ?? null,
    createdBy:            row.created_by as string,
    reviewedBy:           (row.reviewed_by as string | null) ?? null,
    reviewedAt:           (row.reviewed_at as string | null) ?? null,
    rejectionReason:      (row.rejection_reason as string | null) ?? null,
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
  }
}

export async function getVoiceTranscriptsByReport(
  reportId: string,
): Promise<VoiceTranscript[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('voice_transcripts')
    .select('*')
    .eq('report_id', reportId)
    .neq('transcript_status', 'archived')
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => mapVoiceTranscriptRow(row as Record<string, unknown>))
}
