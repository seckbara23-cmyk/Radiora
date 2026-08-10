'use server'

import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { AUDIO_BUCKET, MAX_AUDIO_BYTES } from '@/types/audio'
import { PAIRING_TTL_MINUTES, ACCEPTED_RECORDING_EXT } from '@/types/dictation'
import {
  reportOwner,
  vacationItemOwner,
  ownerColumns,
  audioOwnerColumns,
  ownerAuditMetadata,
  ownerFromRow,
  type DictationOwner,
} from '@/lib/dictation/owner'
import { isReportContentLocked } from '@/lib/safety/immutability'
import type { DictationSessionStatus } from '@/types/dictation'
import type { UserRole } from '@/types/user'

const MANAGE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']

function canManage(role: UserRole): boolean {
  return MANAGE_ROLES.includes(role)
}

function extFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg'))  return 'ogg'
  if (mime.includes('mp4'))  return 'mp4'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav') || mime.includes('wave')) return 'wav'
  if (mime.includes('m4a'))  return 'm4a'
  return ''
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

async function baseUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const h = await headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

// ─── createDictationSession (desktop) ─────────────────────────────────────────
// Mints a capability token, stores the session, and returns a QR (as inline SVG)
// the phone can scan to become a wireless mic for this exact queue item.

export type CreateSessionResult = {
  error:     string | null
  sessionId?: string
  url?:       string
  qrSvg?:     string
  expiresAt?: string
}

/**
 * R2.2 — mint a pairing session for EITHER owner kind.
 *
 * The owner is verified through the user-session client, so RLS proves the
 * caller may see it before a capability token is created for it, and the
 * clinic is taken from the server-resolved user — never from the client.
 * Migration 044's trigger independently re-checks that the owner belongs to the
 * same clinic.
 */
async function createSessionForOwner(owner: DictationOwner): Promise<CreateSessionResult> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'You do not have permission to start mobile dictation.' }
  if (!user.clinicId)        return { error: 'A clinic context is required.' }

  const supabase = await createClient()

  if (owner.kind === 'vacation_item') {
    const { data: item, error } = await supabase
      .from('vacation_items')
      .select('id')
      .eq('id', owner.vacationItemId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!item)  return { error: 'Queue item not found.' }
  } else {
    const { data: report, error } = await supabase
      .from('reports')
      .select('id, status')
      .eq('id', owner.reportId)
      .maybeSingle()
    if (error)  return { error: error.message }
    if (!report) return { error: 'Report not found.' }
    // A signed report is immutable: new dictation must go through the
    // amendment workflow, which re-opens it first.
    if (isReportContentLocked(report.status as string)) {
      return { error: 'This report is signed. Use "Amend Report" before dictating again.' }
    }
  }

  const token     = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString()

  const { data, error } = await supabase
    .from('dictation_sessions')
    .insert({
      clinic_id:  user.clinicId,
      ...ownerColumns(owner),
      created_by: user.id,
      token,
      status:     'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const locale = await getLocale().catch(() => 'fr')
  const url    = `${await baseUrl()}/${locale}/m/${token}`

  let qrSvg: string
  try {
    qrSvg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 232,
      errorCorrectionLevel: 'M',
    })
  } catch {
    return { error: 'Could not generate the pairing QR code.' }
  }

  return { error: null, sessionId: data.id as string, url, qrSvg, expiresAt }
}

/** Existing queue-owned entry point — signature unchanged. */
export async function createDictationSession(itemId: string): Promise<CreateSessionResult> {
  if (!itemId) return { error: 'Missing queue item.' }
  return createSessionForOwner(vacationItemOwner(itemId))
}

/** R2.2 — report-owned QR dictation. */
export async function createReportDictationSession(reportId: string): Promise<CreateSessionResult> {
  if (!reportId) return { error: 'Missing report.' }
  return createSessionForOwner(reportOwner(reportId))
}

// ─── getDictationSessionStatus (desktop polling) ──────────────────────────────

export type SessionStatusResult = {
  error:        string | null
  status?:      DictationSessionStatus
  deviceLabel?: string
  hasAudio?:    boolean
}

export async function getDictationSessionStatus(sessionId: string): Promise<SessionStatusResult> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'Not allowed.' }

  const supabase = await createClient()
  const { data } = await supabase
    .from('dictation_sessions')
    .select('status, device_label, audio_asset_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!data) return { error: 'Session not found.' }

  return {
    error:       null,
    status:      data.status as DictationSessionStatus,
    deviceLabel: (data.device_label as string | null) ?? undefined,
    hasAudio:    Boolean(data.audio_asset_id),
  }
}

// ─── cancelDictationSession (desktop) ─────────────────────────────────────────

export async function cancelDictationSession(sessionId: string): Promise<{ error: string | null }> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'Not allowed.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('dictation_sessions')
    .update({ status: 'cancelled' })
    .eq('id', sessionId)
    .in('status', ['pending', 'connected', 'recording'])
  return { error: error?.message ?? null }
}

// ─── markDeviceConnected (phone, token-validated, service-role) ───────────────

export async function markDeviceConnected(
  token: string,
  deviceLabel: string,
): Promise<{ error: string | null }> {
  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { error: 'Mobile dictation is not configured.' }
  }

  const { data: session } = await admin
    .from('dictation_sessions')
    .select('id, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!session) return { error: 'This dictation link is invalid.' }
  if (['completed', 'cancelled', 'expired'].includes(session.status as string)) {
    return { error: 'This dictation link is no longer active.' }
  }

  await admin
    .from('dictation_sessions')
    .update({ status: 'connected', device_label: deviceLabel.slice(0, 120) })
    .eq('id', session.id as string)

  return { error: null }
}

// ─── uploadFromMobile (phone, token-validated, service-role) ──────────────────
// The phone has no login; the token authorizes this single upload. Runs entirely
// server-side with the service-role client — the key is never sent to the phone.

export async function uploadFromMobile(
  token: string,
  formData: FormData,
): Promise<{ error: string | null; ok?: boolean }> {
  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { error: 'Mobile dictation is not configured.' }
  }

  const { data: session } = await admin
    .from('dictation_sessions')
    .select('id, clinic_id, vacation_item_id, report_id, created_by, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!session) return { error: 'This dictation link is invalid.' }
  if (['completed', 'cancelled', 'expired'].includes(session.status as string)) {
    return { error: 'This dictation link is no longer active.' }
  }
  if (new Date(session.expires_at as string).getTime() < Date.now()) {
    await admin.from('dictation_sessions').update({ status: 'expired' }).eq('id', session.id as string)
    return { error: 'This dictation link has expired.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No audio captured.' }
  if (file.size > MAX_AUDIO_BYTES)                return { error: 'The recording is too large (max 100 MB).' }

  const ext = extOf(file.name) || extFromMime(file.type)
  if (!(ACCEPTED_RECORDING_EXT as readonly string[]).includes(ext)) {
    return { error: 'Unsupported recording format.' }
  }

  const clinicId   = session.clinic_id as string
  const uploadedBy = session.created_by as string
  const deviceLabel = String(formData.get('deviceLabel') ?? '').slice(0, 120) || null

  // R2.2 — the token resolves to exactly ONE owner, recorded when the session
  // was minted. The phone never says where the audio belongs.
  const owner = ownerFromRow(session as { report_id?: string | null; vacation_item_id?: string | null })
  if (!owner) return { error: 'This dictation link is not attached to a report or queue item.' }

  // A report signed since the QR was shown must not accept new audio.
  if (owner.kind === 'report') {
    const { data: report } = await admin
      .from('reports')
      .select('status, clinic_id')
      .eq('id', owner.reportId)
      .maybeSingle()
    if (!report) return { error: 'The linked report no longer exists.' }
    if ((report.clinic_id as string) !== clinicId) {
      return { error: 'This dictation link is invalid.' }
    }
    if (isReportContentLocked(report.status as string)) {
      return { error: 'This report has been signed and can no longer accept dictation.' }
    }
  }

  const assetId = crypto.randomUUID()
  const path    = `${clinicId}/${assetId}.${ext}`

  const { error: uploadError } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

  const { error: assetError } = await admin.from('audio_assets').insert({
    id:                assetId,
    clinic_id:         clinicId,
    ...audioOwnerColumns(owner),
    uploaded_by:       uploadedBy,
    original_filename: file.name || `mobile-dictation.${ext}`,
    mime_type:         file.type || 'application/octet-stream',
    file_size_bytes:   file.size,
    storage_path:      path,
    ingestion_mode:    'single',
    status:            'assigned',
  })
  if (assetError) {
    await admin.storage.from(AUDIO_BUCKET).remove([path])
    return { error: assetError.message }
  }

  if (owner.kind === 'vacation_item') {
    // Unchanged queue behaviour: attach audio, advance audio_received →
    // transcribing, open an editable transcript draft if none exists.
    const itemId = owner.vacationItemId

    const { data: item } = await admin
      .from('vacation_items')
      .select('workflow_status')
      .eq('id', itemId)
      .maybeSingle()

    const nextStatus =
      item?.workflow_status === 'audio_received' ? 'transcribing' : item?.workflow_status

    const { error: itemError } = await admin
      .from('vacation_items')
      .update({ audio_asset_id: assetId, workflow_status: nextStatus })
      .eq('id', itemId)
    if (itemError) return { error: itemError.message }

    const { data: existing } = await admin
      .from('transcriptions')
      .select('id')
      .eq('vacation_item_id', itemId)
      .maybeSingle()
    if (!existing) {
      const { error: trError } = await admin.from('transcriptions').insert({
        clinic_id:      clinicId,
        ...ownerColumns(owner),
        audio_asset_id: assetId,
        created_by:     uploadedBy,
      })
      if (trError) return { error: trError.message }
    }

    revalidatePath(`/vacations/items/${itemId}`)
    revalidatePath('/secretary')
  } else {
    // Report-owned: no queue row is touched. Open a transcript draft for this
    // report if it has none yet; a report may be dictated in several passes.
    const { data: existing } = await admin
      .from('transcriptions')
      .select('id')
      .eq('report_id', owner.reportId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existing) {
      const { error: trError } = await admin.from('transcriptions').insert({
        clinic_id:      clinicId,
        ...ownerColumns(owner),
        audio_asset_id: assetId,
        created_by:     uploadedBy,
      })
      if (trError) return { error: trError.message }
    } else {
      const { error: trError } = await admin
        .from('transcriptions')
        .update({ audio_asset_id: assetId })
        .eq('id', existing.id as string)
      if (trError) return { error: trError.message }
    }

    revalidatePath(`/reports/${owner.reportId}`)
  }

  const { error: sessionError } = await admin
    .from('dictation_sessions')
    .update({ status: 'completed', audio_asset_id: assetId, device_label: deviceLabel })
    .eq('id', session.id as string)
  if (sessionError) return { error: sessionError.message }

  // Audit via the service-role client (the phone request carries no user
  // cookie). Owner kind + id only — never the token, never transcript content.
  try {
    await admin.from('audit_logs').insert({
      user_id:     uploadedBy,
      clinic_id:   clinicId,
      action:      'dictation.mobile_uploaded',
      entity_type: 'audio_asset',
      entity_id:   assetId,
      metadata:    { ...ownerAuditMetadata(owner), sizeBytes: file.size, ext },
    })
  } catch {
    // Audit failures never block the upload.
  }

  return { error: null, ok: true }
}
