'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { mapVoiceTranscriptRow } from '@/lib/data/voice-transcripts'
import type { VoiceTranscript, TranscriptSource } from '@/lib/data/voice-transcripts'

type ReviewRole = 'clinic_admin' | 'radiologist' | 'super_admin'
const REVIEW_ROLES: ReviewRole[] = ['clinic_admin', 'radiologist', 'super_admin']

export type VoiceResult = {
  error: string | null
  transcript?: VoiceTranscript
}

export type SimpleVoiceResult = {
  error: string | null
}

// ─── createVoiceTranscript ────────────────────────────────────────────────────
// Persists a new voice transcript (text only — no audio stored).

export async function createVoiceTranscript(
  reportId: string,
  transcriptText: string,
  source: TranscriptSource,
  durationSeconds: number | null,
): Promise<VoiceResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to create voice transcripts.' }
  }

  const trimmed = transcriptText.trim()
  if (!trimmed) return { error: 'Transcript text cannot be empty.' }

  const supabase = await createClient()

  const { data: report } = await supabase
    .from('reports')
    .select('id, study_id, patient_id')
    .eq('id', reportId)
    .single()

  if (!report) return { error: 'Report not found.' }

  const { data: inserted, error: insertError } = await supabase
    .from('voice_transcripts')
    .insert({
      clinic_id:             user.clinicId,
      report_id:             reportId,
      study_id:              report.study_id ?? null,
      patient_id:            report.patient_id ?? null,
      language:              'en',
      transcript_status:     'transcribed',
      transcript_text:       trimmed,
      transcript_source:     source,
      audio_duration_seconds: durationSeconds,
      created_by:            user.id,
    })
    .select('*')
    .single()

  if (insertError || !inserted) return { error: 'Failed to save transcript.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'voice.transcript_created',
    entityType: 'report',
    entityId:   reportId,
    metadata:   {
      transcriptId: (inserted as Record<string, unknown>).id,
      source,
      durationSeconds,
    },
  })

  return { error: null, transcript: mapVoiceTranscriptRow(inserted as Record<string, unknown>) }
}

// ─── reviewVoiceTranscript ────────────────────────────────────────────────────
// Marks a transcript as clinician-reviewed (satisfied with text before apply).

export async function reviewVoiceTranscript(
  transcriptId: string,
  reportId: string,
): Promise<VoiceResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to review voice transcripts.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('voice_transcripts')
    .update({
      transcript_status: 'reviewed',
      reviewed_by:       user.id,
      reviewed_at:       new Date().toISOString(),
    })
    .eq('id', transcriptId)
    .in('transcript_status', ['transcribed', 'recorded'])
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to mark transcript as reviewed.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'voice.transcript_reviewed',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { transcriptId },
  })

  return { error: null, transcript: mapVoiceTranscriptRow(data as Record<string, unknown>) }
}

// ─── rejectVoiceTranscript ────────────────────────────────────────────────────

export async function rejectVoiceTranscript(
  transcriptId: string,
  reportId: string,
  reason: string,
): Promise<VoiceResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission to reject voice transcripts.' }
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'A rejection reason is required.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('voice_transcripts')
    .update({
      transcript_status: 'rejected',
      reviewed_by:       user.id,
      reviewed_at:       new Date().toISOString(),
      rejection_reason:  trimmedReason,
    })
    .eq('id', transcriptId)
    .in('transcript_status', ['transcribed', 'recorded', 'reviewed'])
    .select('*')
    .single()

  if (error || !data) return { error: 'Failed to reject transcript.' }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'voice.transcript_rejected',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { transcriptId, reason: trimmedReason },
  })

  return { error: null, transcript: mapVoiceTranscriptRow(data as Record<string, unknown>) }
}

// ─── applyVoiceTranscript ─────────────────────────────────────────────────────
// Records that a transcript was forwarded to Smart Structuring for processing.
// Does not modify the report directly — clinician uses Smart Structuring to accept/reject.

export async function applyVoiceTranscript(
  transcriptId: string,
  reportId: string,
): Promise<SimpleVoiceResult> {
  const user = await requireCurrentUser()

  if (!REVIEW_ROLES.includes(user.role as ReviewRole)) {
    return { error: 'You do not have permission.' }
  }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'voice.transcript_applied',
    entityType: 'report',
    entityId:   reportId,
    metadata:   { transcriptId },
  })

  return { error: null }
}
