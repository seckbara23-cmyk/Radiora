'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import {
  AUDIO_BUCKET,
  ACCEPTED_AUDIO_EXT,
  MAX_AUDIO_BYTES,
  type IngestionMode,
} from '@/types/audio'
import type { UserRole } from '@/types/user'

export type AudioActionResult = { error: string | null; assetId?: string }

// Clerical staff who may ingest audio and edit transcripts. A secretary is
// included — but never gains diagnostic validation authority (enforced in 017).
const MANAGE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']
const MODES: IngestionMode[] = ['single', 'batch', 'long']

function canManage(role: UserRole): boolean {
  return MANAGE_ROLES.includes(role)
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

async function revalidateItem(itemId: string, vacationId?: string) {
  revalidatePath('/secretary')
  revalidatePath('/vacations')
  revalidatePath(`/vacations/items/${itemId}`)
  if (vacationId) revalidatePath(`/vacations/${vacationId}`)
}

// ─── uploadAudio ───────────────────────────────────────────────────────────────
// Receives a multipart form. Stores the file privately, records an audio_asset,
// and (when a queue item is given) links it and opens a transcription draft.
// No external speech-to-text is invoked — the transcript starts empty/editable.

export async function uploadAudio(formData: FormData): Promise<AudioActionResult> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'You do not have permission to upload audio.' }
  if (!user.clinicId)        return { error: 'A clinic context is required to upload audio.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose an audio file.' }
  if (file.size > MAX_AUDIO_BYTES)                return { error: 'The audio file is too large (max 100 MB).' }

  const ext = extOf(file.name)
  if (!(ACCEPTED_AUDIO_EXT as readonly string[]).includes(ext)) {
    return { error: 'Unsupported format. Use MP3, MP4, WAV or M4A.' }
  }

  const rawMode      = String(formData.get('mode') ?? 'single') as IngestionMode
  const mode         = MODES.includes(rawMode) ? rawMode : 'single'
  const vacationId   = (formData.get('vacationId') as string) || null
  const vacationItem = (formData.get('vacationItemId') as string) || null

  const supabase = await createClient()
  const assetId  = crypto.randomUUID()
  const path     = `${user.clinicId}/${assetId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

  const { error: assetError } = await supabase.from('audio_assets').insert({
    id:                assetId,
    clinic_id:         user.clinicId,
    vacation_id:       vacationId,
    uploaded_by:       user.id,
    original_filename: file.name,
    mime_type:         file.type || 'application/octet-stream',
    file_size_bytes:   file.size,
    storage_path:      path,
    ingestion_mode:    mode,
    status:            vacationItem ? 'assigned' : 'uploaded',
  })
  if (assetError) {
    // Roll back the orphaned object so storage doesn't drift from the table.
    await supabase.storage.from(AUDIO_BUCKET).remove([path])
    return { error: assetError.message }
  }

  // Link to a queue item: attach the audio, advance audio_received -> transcribing,
  // and open an (empty, editable) transcription draft if none exists yet.
  if (vacationItem) {
    const { data: item } = await supabase
      .from('vacation_items')
      .select('id, vacation_id, workflow_status')
      .eq('id', vacationItem)
      .maybeSingle()

    if (item) {
      const nextStatus =
        item.workflow_status === 'audio_received' ? 'transcribing' : item.workflow_status

      await supabase
        .from('vacation_items')
        .update({ audio_asset_id: assetId, workflow_status: nextStatus })
        .eq('id', vacationItem)

      const { data: existing } = await supabase
        .from('transcriptions')
        .select('id')
        .eq('vacation_item_id', vacationItem)
        .maybeSingle()

      if (!existing) {
        await supabase.from('transcriptions').insert({
          clinic_id:        user.clinicId,
          vacation_item_id: vacationItem,
          audio_asset_id:   assetId,
          created_by:       user.id,
        })
      }

      await revalidateItem(vacationItem, item.vacation_id as string)
    }
  }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'audio.uploaded',
    entityType: 'audio_asset',
    entityId:   assetId,
    metadata:   { mode, vacationItemId: vacationItem, sizeBytes: file.size },
  })

  revalidatePath('/secretary')
  return { error: null, assetId }
}

// ─── saveTranscription ──────────────────────────────────────────────────────────
// Persists the editable working transcript. Diagnostic content is the physician's
// responsibility; this only stores text and never finalizes anything.

export async function saveTranscription(input: {
  itemId:        string
  correctedText: string
  rawText?:      string
}): Promise<{ error: string | null }> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'You do not have permission to edit transcripts.' }
  if (!user.clinicId)        return { error: 'A clinic context is required.' }
  if (!input.itemId)         return { error: 'Missing queue item.' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('transcriptions')
    .select('id')
    .eq('vacation_item_id', input.itemId)
    .maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = { corrected_text: input.correctedText }
    if (input.rawText !== undefined) patch.raw_text = input.rawText
    const { error } = await supabase.from('transcriptions').update(patch).eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('transcriptions').insert({
      clinic_id:        user.clinicId,
      vacation_item_id: input.itemId,
      raw_text:         input.rawText ?? '',
      corrected_text:   input.correctedText,
      created_by:       user.id,
    })
    if (error) return { error: error.message }
  }

  await revalidateItem(input.itemId)
  return { error: null }
}

// ─── matchItemPatient ───────────────────────────────────────────────────────────
// Links a queue item (and its audio) to a patient record.

export async function matchItemPatient(input: {
  itemId:    string
  patientId: string
}): Promise<{ error: string | null }> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'You do not have permission to match patients.' }
  if (!input.itemId || !input.patientId) return { error: 'Missing item or patient.' }

  const supabase = await createClient()
  const { data: item } = await supabase
    .from('vacation_items')
    .select('vacation_id')
    .eq('id', input.itemId)
    .maybeSingle()

  const { error } = await supabase
    .from('vacation_items')
    .update({ patient_id: input.patientId })
    .eq('id', input.itemId)
  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'vacation.item_patient_matched',
    entityType: 'vacation_item',
    entityId:   input.itemId,
    metadata:   { patientId: input.patientId },
  })

  await revalidateItem(input.itemId, item?.vacation_id as string | undefined)
  return { error: null }
}

// ─── routeToRadiologist ─────────────────────────────────────────────────────────
// Secretary hand-off: marks the transcript secretary-reviewed and moves the item
// to 'radiologist_review'. The secretary never validates a diagnosis — this only
// routes the work to a physician.

export async function routeToRadiologist(input: {
  itemId: string
}): Promise<{ error: string | null }> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'You do not have permission to route reports.' }
  if (!input.itemId)         return { error: 'Missing queue item.' }

  const supabase = await createClient()
  const { data: item } = await supabase
    .from('vacation_items')
    .select('vacation_id, workflow_status')
    .eq('id', input.itemId)
    .maybeSingle()
  if (!item) return { error: 'Queue item not found.' }

  await supabase
    .from('transcriptions')
    .update({ status: 'secretary_reviewed', reviewed_by: user.id })
    .eq('vacation_item_id', input.itemId)

  const { error } = await supabase
    .from('vacation_items')
    .update({ workflow_status: 'radiologist_review' })
    .eq('id', input.itemId)
  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'vacation.routed_to_radiologist',
    entityType: 'vacation_item',
    entityId:   input.itemId,
    metadata:   { from: item.workflow_status },
  })

  await revalidateItem(input.itemId, item.vacation_id as string)
  return { error: null }
}
