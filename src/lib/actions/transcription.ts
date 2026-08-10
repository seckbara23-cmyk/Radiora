'use server'

// R2.7A — automatic speech-to-text for phone and imported audio.
//
// THE ORDER MATTERS AND IT IS NOT NEGOTIABLE:
//
//   audio → STT → RAW text → persist raw → runStructuring → structured proposal
//
// The provider's transcript is persisted BEFORE any cleanup, correction
// resolution or section routing runs. That is what lets a radiologist tell
// "what the microphone heard" from "what Radiora structured", and it is why
// nothing in this file touches French cleanup or the section router. Those
// belong downstream, in the one canonical pipeline every source already shares.
//
// STT never writes a report section, never signs, never validates.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { isReportContentLocked } from '@/lib/safety/immutability'
import { AUDIO_BUCKET } from '@/types/audio'
import { getSttProvider, getSttSettings } from '@/lib/stt'
import {
  SttError,
  isSupportedSttMime,
  mimeForAudioExtension,
  type SttErrorCode,
} from '@/lib/stt/types'
import {
  appendTranscriptPass,
  transcriptionStage,
  type TranscriptionStage,
} from '@/lib/dictation/transcription-state'
import type { UserRole } from '@/types/user'

const MANAGE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']

export interface TranscribeResult {
  error: string | null
  /** Safe category for the UI to branch on. Never a provider body. */
  code?: SttErrorCode | 'not_allowed' | 'no_audio' | 'already_processing' | 'report_locked'
  stage?: TranscriptionStage
  /** The canonical transcript after this pass, for the workspace to display. */
  transcript?: string
}

/** Postgres unique violation — another worker owns this audio asset. */
const UNIQUE_VIOLATION = '23505'

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

/**
 * Transcribe the newest report-owned recording that has no completed
 * transcription yet.
 *
 * Idempotent by construction: the claim is an INSERT against a partial unique
 * index (migration 045), so two concurrent invocations both try and exactly one
 * wins. The loser returns `already_processing` WITHOUT calling the provider —
 * no double spend, no duplicate transcript, no duplicate audit entry.
 */
export async function transcribeReportAudio(reportId: string): Promise<TranscribeResult> {
  if (!reportId) return { error: 'Missing report.', code: 'no_audio' }

  const user = await requireCurrentUser()
  if (!MANAGE_ROLES.includes(user.role)) {
    return { error: 'You do not have permission to transcribe this recording.', code: 'not_allowed' }
  }

  const supabase = await createClient()

  // ── Ownership. Every fact comes from the server; nothing from the browser
  //    except the report id, which RLS then has to agree the caller may see.
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id, clinic_id, status')
    .eq('id', reportId)
    .maybeSingle()
  if (reportError) return { error: 'Could not load the report.', code: 'unknown' }
  if (!report)     return { error: 'Report not found.', code: 'no_audio' }
  if (isReportContentLocked(report.status as string)) {
    return { error: 'This report is signed and can no longer be transcribed.', code: 'report_locked' }
  }
  const clinicId = report.clinic_id as string

  // ── The transcript row this report owns (R2.2/044).
  const { data: transcription, error: trError } = await supabase
    .from('transcriptions')
    .select('id, raw_text, audio_asset_id')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (trError) return { error: 'Could not load the transcript.', code: 'unknown' }
  if (!transcription?.audio_asset_id) {
    return { error: 'There is no recording to transcribe.', code: 'no_audio' }
  }
  const transcriptionId = transcription.id as string
  const assetId         = transcription.audio_asset_id as string

  // ── The audio asset, verified to belong to this clinic AND this report.
  const { data: asset, error: assetError } = await supabase
    .from('audio_assets')
    .select('id, clinic_id, report_id, storage_path, mime_type, file_size_bytes')
    .eq('id', assetId)
    .maybeSingle()
  if (assetError) return { error: 'Could not load the recording.', code: 'unknown' }
  if (!asset)     return { error: 'The recording no longer exists.', code: 'no_audio' }
  if ((asset.clinic_id as string) !== clinicId) {
    return { error: 'The recording belongs to another clinic.', code: 'no_audio' }
  }
  if (asset.report_id && (asset.report_id as string) !== reportId) {
    return { error: 'The recording belongs to another report.', code: 'no_audio' }
  }
  if (!asset.file_size_bytes || (asset.file_size_bytes as number) === 0) {
    return { error: 'The recording is empty.', code: 'empty_audio' }
  }

  // ── Format. A generic octet-stream is resolved from the stored extension
  //    rather than guessed: sending an unlabelled container is how a silent
  //    mis-transcription starts.
  const storagePath = asset.storage_path as string
  const stored      = (asset.mime_type as string | null) ?? ''
  const mimeType    = isSupportedSttMime(stored)
    ? stored.split(';')[0].trim().toLowerCase()
    : mimeForAudioExtension(extensionOf(storagePath)) ?? ''
  if (!isSupportedSttMime(mimeType)) {
    return { error: 'This recording format cannot be transcribed.', code: 'unsupported_audio' }
  }

  // ── Provider must exist BEFORE the claim, so an unconfigured deployment does
  //    not leave a stuck `processing` row behind.
  const settings = getSttSettings()
  if (!settings) {
    return {
      error: 'Automatic transcription is not configured on this installation.',
      code: 'not_configured',
    }
  }

  // ── THE CLAIM. Partial unique index on (audio_asset_id) where status is
  //    processing|completed. Exactly one caller inserts; everyone else gets
  //    23505 and stops here, before spending a provider call.
  const { data: claimed, error: claimError } = await supabase
    .from('transcription_runs')
    .insert({
      clinic_id:        clinicId,
      transcription_id: transcriptionId,
      audio_asset_id:   assetId,
      report_id:        reportId,
      status:           'processing',
      provider:         settings.provider,
      model:            settings.model,
      language:         settings.language,
      audio_mime:       mimeType,
      audio_bytes:      asset.file_size_bytes as number,
      created_by:       user.id,
    })
    .select('id')
    .single()

  if (claimError) {
    if (claimError.code === UNIQUE_VIOLATION) {
      // Another worker owns it, or it is already done. Report the real stage.
      return { error: null, code: 'already_processing', stage: await stageFor(supabase, assetId) }
    }
    return { error: 'Could not start the transcription.', code: 'unknown' }
  }
  const runId = claimed.id as string

  await logAudit({
    userId: user.id, clinicId,
    action: 'transcription.started',
    entityType: 'audio_asset', entityId: assetId,
    // Operational facts only — no transcript, no URL, no key.
    metadata: {
      reportId, runId, provider: settings.provider, model: settings.model,
      mime: mimeType, sizeBytes: asset.file_size_bytes as number,
    },
  }).catch(() => {})

  const startedAt = Date.now()

  const fail = async (code: SttErrorCode, message: string): Promise<TranscribeResult> => {
    await supabase
      .from('transcription_runs')
      .update({
        status: 'failed', error_code: code, completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', runId)
    await logAudit({
      userId: user.id, clinicId,
      action: 'transcription.failed',
      entityType: 'audio_asset', entityId: assetId,
      metadata: { reportId, runId, failureCategory: code, durationMs: Date.now() - startedAt },
    }).catch(() => {})
    return { error: message, code, stage: 'failed' }
  }

  // ── Read the private object. Storage is never made public; the server
  //    downloads it with the caller's own RLS-scoped session.
  const { data: blob, error: downloadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .download(storagePath)
  if (downloadError || !blob) {
    return fail('unavailable', 'The recording could not be read.')
  }
  if (blob.size === 0) {
    return fail('empty_audio', 'The recording is empty.')
  }

  // ── Provider call. Only audio + language (+ optional bounded vocabulary)
  //    leave Radiora; see the adapter.
  let text: string
  let language: string | undefined
  let durationSeconds: number | undefined
  try {
    const provider = getSttProvider()
    const result = await provider.transcribe({
      audio: blob,
      mimeType,
      filename: `dictation.${extensionOf(storagePath) || 'webm'}`,
      language: settings.language,
    })
    text = result.text
    language = result.language
    durationSeconds = result.durationSeconds
  } catch (err) {
    const code: SttErrorCode = err instanceof SttError ? err.code : 'unknown'
    return fail(code, messageFor(code))
  }

  // ── RAW TEXT IS PROVENANCE. Persisted verbatim, before anything cleans,
  //    corrects or routes it.
  const { error: runError } = await supabase
    .from('transcription_runs')
    .update({
      status: 'completed',
      raw_text: text,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      language: language ?? settings.language,
    })
    .eq('id', runId)
  if (runError) return fail('unknown', 'The transcript could not be saved.')

  // A report may be dictated in several passes. Earlier text is never
  // destroyed: this pass is appended, and the combined canonical transcript is
  // what the structuring pipeline later reads as ONE complete transcript.
  const canonical = appendTranscriptPass((transcription.raw_text as string) ?? '', text)

  const { error: saveError } = await supabase
    .from('transcriptions')
    .update({ raw_text: canonical, corrected_text: canonical })
    .eq('id', transcriptionId)
  if (saveError) return fail('unknown', 'The transcript could not be saved.')

  await supabase.from('audio_assets').update({ status: 'transcribed' }).eq('id', assetId)

  await logAudit({
    userId: user.id, clinicId,
    action: 'transcription.completed',
    entityType: 'audio_asset', entityId: assetId,
    // Length, not content.
    metadata: {
      reportId, runId, provider: settings.provider, model: settings.model,
      durationMs: Date.now() - startedAt,
      audioSeconds: durationSeconds ?? null,
      transcriptLength: text.length,
    },
  }).catch(() => {})

  revalidatePath(`/reports/${reportId}`)
  return { error: null, stage: 'completed', transcript: canonical }
}

/**
 * Explicit retry after a failure. The same audio asset is reused — the doctor
 * never re-records — and the claim is taken again, so a run that is already
 * processing or completed is refused rather than duplicated.
 */
export async function retryReportTranscription(reportId: string): Promise<TranscribeResult> {
  const user = await requireCurrentUser()
  if (!MANAGE_ROLES.includes(user.role)) {
    return { error: 'You do not have permission to transcribe this recording.', code: 'not_allowed' }
  }
  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'transcription.retried',
    entityType: 'report', entityId: reportId,
    metadata: { reportId },
  }).catch(() => {})

  // Nothing special: the claim itself is the whole retry policy. A failed run
  // released the index, a completed one still holds it.
  return transcribeReportAudio(reportId)
}

/** Where the newest recording for this report has got to. */
export async function getReportTranscriptionStage(
  reportId: string,
): Promise<{ error: string | null; stage?: TranscriptionStage; configured?: boolean }> {
  if (!reportId) return { error: 'Missing report.' }
  const user = await requireCurrentUser()
  if (!MANAGE_ROLES.includes(user.role)) return { error: 'Not allowed.' }

  const supabase = await createClient()
  const { data: transcription } = await supabase
    .from('transcriptions')
    .select('audio_asset_id, raw_text')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!transcription?.audio_asset_id) {
    return { error: null, stage: 'none', configured: Boolean(getSttSettings()) }
  }

  return {
    error: null,
    stage: await stageFor(supabase, transcription.audio_asset_id as string),
    configured: Boolean(getSttSettings()),
  }
}

type Db = Awaited<ReturnType<typeof createClient>>

async function stageFor(supabase: Db, assetId: string): Promise<TranscriptionStage> {
  const { data } = await supabase
    .from('transcription_runs')
    .select('status')
    .eq('audio_asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return transcriptionStage((data?.status as string | undefined) ?? null)
}

/** Operator-facing wording per failure category. Never a provider body. */
function messageFor(code: SttErrorCode): string {
  switch (code) {
    case 'not_configured':   return 'Automatic transcription is not configured on this installation.'
    case 'auth':             return 'The transcription service rejected this installation’s credentials.'
    case 'timeout':          return 'The transcription service did not respond in time.'
    case 'rate_limited':     return 'The transcription service is busy. Try again shortly.'
    case 'unavailable':      return 'The transcription service is unavailable.'
    case 'too_large':        return 'This recording is too long for the transcription service.'
    case 'unsupported_audio':return 'This recording format cannot be transcribed.'
    case 'empty_audio':      return 'The recording is empty.'
    case 'empty_transcript': return 'No speech was detected in this recording.'
    case 'malformed_response':
    case 'unknown':
    default:                 return 'The transcription failed.'
  }
}
