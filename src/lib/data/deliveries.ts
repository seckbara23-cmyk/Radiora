// F17 — read access to report_deliveries.
//
// Two distinct readers:
//   * getReportDeliveries / getDelivery — STAFF reads through the user-session
//     client, so RLS confines them to their own clinic.
//   * getPublicDeliveryByToken — the PUBLIC path reads through the service-role
//     client (the patient has no session); the secret token is the access proof.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DeliveryChannel, PasswordKind } from '@/lib/delivery/policy'
import type { ReportDelivery, PublicDelivery } from '@/types/delivery'

const STAFF_COLS =
  'id, clinic_id, report_id, channel, recipient_label, token, password_kind, password_hash, filename_base, header_choice, expires_at, opened_count, download_count, last_accessed_at, revoked_at, created_by, created_at, updated_at'

const PUBLIC_COLS =
  'id, clinic_id, report_id, channel, password_kind, password_hash, pdf_path, docx_path, filename_base, expires_at, revoked_at'

function mapStaffRow(row: Record<string, unknown>): ReportDelivery {
  const passwordHash = (row.password_hash as string | null) ?? null
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    reportId: row.report_id as string,
    channel: row.channel as DeliveryChannel,
    recipientLabel: (row.recipient_label as string) ?? '',
    token: row.token as string,
    passwordKind: (row.password_kind as PasswordKind) ?? 'none',
    hasPassword: Boolean(passwordHash),
    filenameBase: (row.filename_base as string) ?? 'compte-rendu',
    headerChoice: (row.header_choice as string) ?? '',
    expiresAt: (row.expires_at as string | null) ?? null,
    openedCount: Number(row.opened_count ?? 0),
    downloadCount: Number(row.download_count ?? 0),
    lastAccessedAt: (row.last_accessed_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function getReportDeliveries(reportId: string): Promise<ReportDelivery[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('report_deliveries')
    .select(STAFF_COLS)
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(mapStaffRow)
}

export async function getDelivery(id: string): Promise<ReportDelivery | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('report_deliveries')
    .select(STAFF_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return mapStaffRow(data as unknown as Record<string, unknown>)
}

// PUBLIC: resolve a delivery by its secret token. Service-role client — no session.
export async function getPublicDeliveryByToken(token: string): Promise<PublicDelivery | null> {
  const value = (token ?? '').trim()
  if (!value) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('report_deliveries')
    .select(PUBLIC_COLS)
    .eq('token', value)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as Record<string, unknown>
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    reportId: row.report_id as string,
    channel: row.channel as DeliveryChannel,
    passwordKind: (row.password_kind as PasswordKind) ?? 'none',
    passwordHash: (row.password_hash as string | null) ?? null,
    pdfPath: (row.pdf_path as string | null) ?? null,
    docxPath: (row.docx_path as string | null) ?? null,
    filenameBase: (row.filename_base as string) ?? 'compte-rendu',
    expiresAt: (row.expires_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }
}
