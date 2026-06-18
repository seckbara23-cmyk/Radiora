import { createClient } from '@/lib/supabase/server'
import { AUDIO_BUCKET } from '@/types/audio'
import type { Modality } from '@/types/study'
import type {
  AudioAsset,
  AudioAssetStatus,
  IngestionMode,
  Transcription,
  TranscriptionStatus,
} from '@/types/audio'
import type { VacationWorkflowStatus } from '@/types/vacation'

const ASSET_SELECT =
  'id, clinic_id, vacation_id, uploaded_by, original_filename, mime_type, file_size_bytes, duration_seconds, storage_path, ingestion_mode, status, created_at, updated_at'

const TRANSCRIPTION_SELECT =
  'id, clinic_id, vacation_item_id, audio_asset_id, language, raw_text, corrected_text, status, created_by, reviewed_by, created_at, updated_at'

function mapAsset(row: Record<string, unknown>): AudioAsset {
  return {
    id:               row.id as string,
    clinicId:         row.clinic_id as string,
    vacationId:       (row.vacation_id as string | null) ?? undefined,
    uploadedBy:       row.uploaded_by as string,
    originalFilename: row.original_filename as string,
    mimeType:         row.mime_type as string,
    fileSizeBytes:    (row.file_size_bytes as number) ?? 0,
    durationSeconds:  (row.duration_seconds as number | null) ?? undefined,
    storagePath:      row.storage_path as string,
    ingestionMode:    row.ingestion_mode as IngestionMode,
    status:           row.status as AudioAssetStatus,
    createdAt:        row.created_at as string,
    updatedAt:        row.updated_at as string,
  }
}

function mapTranscription(row: Record<string, unknown>): Transcription {
  return {
    id:             row.id as string,
    clinicId:       row.clinic_id as string,
    vacationItemId: row.vacation_item_id as string,
    audioAssetId:   (row.audio_asset_id as string | null) ?? undefined,
    language:       (row.language as string) ?? 'fr',
    rawText:        (row.raw_text as string) ?? '',
    correctedText:  (row.corrected_text as string) ?? '',
    status:         row.status as TranscriptionStatus,
    createdBy:      row.created_by as string,
    reviewedBy:     (row.reviewed_by as string | null) ?? undefined,
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
  }
}

export async function getAudioAsset(id: string): Promise<AudioAsset | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('audio_assets').select(ASSET_SELECT).eq('id', id).maybeSingle()
  return data ? mapAsset(data) : null
}

export async function getTranscription(vacationItemId: string): Promise<Transcription | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('transcriptions')
    .select(TRANSCRIPTION_SELECT)
    .eq('vacation_item_id', vacationItemId)
    .maybeSingle()
  return data ? mapTranscription(data) : null
}

/**
 * A short-lived signed URL for streaming a private audio asset in the browser.
 * The bucket is never public; this keeps PHI inside the tenant boundary.
 */
export async function createSignedAudioUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(storagePath, expiresInSeconds)
  return data?.signedUrl ?? null
}

// ─── Secretary worklist ───────────────────────────────────────────────────────
// Items needing clerical attention: audio received, being transcribed, or up for
// secretary review — across every open session.

export interface SecretaryQueueItem {
  id:               string
  vacationId:       string
  vacationTitle:    string
  vacationModality: Modality
  vacationDate:     string
  workflowStatus:   VacationWorkflowStatus
  patientName?:     string
  patientLabel?:    string
  examNumber?:      string
  hasAudio:         boolean
  transcriptionStatus?: TranscriptionStatus
}

const SECRETARY_STATUSES: VacationWorkflowStatus[] = ['audio_received', 'transcribing', 'secretary_review']

export async function getSecretaryItems(opts?: {
  status?: VacationWorkflowStatus
}): Promise<SecretaryQueueItem[]> {
  const supabase = await createClient()

  const statuses = opts?.status ? [opts.status] : SECRETARY_STATUSES

  const { data: itemRows } = await supabase
    .from('vacation_items')
    .select('id, vacation_id, audio_asset_id, patient_id, patient_label, exam_number, workflow_status, created_at')
    .in('workflow_status', statuses)
    .order('created_at', { ascending: true })

  const items = itemRows ?? []
  if (items.length === 0) return []

  const vacationIds = [...new Set(items.map((i) => i.vacation_id as string))]
  const patientIds  = [...new Set(items.map((i) => i.patient_id as string | null).filter(Boolean))] as string[]
  const itemIds     = items.map((i) => i.id as string)

  const [vacRes, patRes, transRes] = await Promise.all([
    supabase.from('vacations').select('id, title, modality, vacation_date').in('id', vacationIds),
    patientIds.length
      ? supabase.from('patients').select('id, first_name, last_name').in('id', patientIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.from('transcriptions').select('vacation_item_id, status').in('vacation_item_id', itemIds),
  ])

  const vacMeta: Record<string, { title: string; modality: Modality; date: string }> = Object.fromEntries(
    (vacRes.data ?? []).map((v) => [
      v.id as string,
      { title: v.title as string, modality: v.modality as Modality, date: v.vacation_date as string },
    ]),
  )
  const patientName: Record<string, string> = Object.fromEntries(
    (patRes.data ?? []).map((p) => [p.id as string, `${p.last_name as string} ${p.first_name as string}`]),
  )
  const transStatus: Record<string, TranscriptionStatus> = Object.fromEntries(
    (transRes.data ?? []).map((tr) => [tr.vacation_item_id as string, tr.status as TranscriptionStatus]),
  )

  return items.map((i) => {
    const meta = vacMeta[i.vacation_id as string]
    const pid  = i.patient_id as string | null
    return {
      id:                  i.id as string,
      vacationId:          i.vacation_id as string,
      vacationTitle:       meta?.title ?? '',
      vacationModality:    meta?.modality ?? ('CT' as Modality),
      vacationDate:        meta?.date ?? '',
      workflowStatus:      i.workflow_status as VacationWorkflowStatus,
      patientName:         pid ? patientName[pid] : undefined,
      patientLabel:        (i.patient_label as string | null) ?? undefined,
      examNumber:          (i.exam_number as string | null) ?? undefined,
      hasAudio:            Boolean(i.audio_asset_id),
      transcriptionStatus: transStatus[i.id as string],
    }
  })
}

/** Patients in the clinic, for matching unassigned audio to a record. */
export async function getClinicPatients(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .order('last_name', { ascending: true })
    .limit(500)
  return (data ?? []).map((p) => ({
    id:   p.id as string,
    name: `${p.last_name as string} ${p.first_name as string}`,
  }))
}
