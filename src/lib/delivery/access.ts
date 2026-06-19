// F17 — PUBLIC (unauthenticated) delivery access path.
//
// The patient/physician has no Supabase session: every read and write here goes
// through the service-role client and is gated only by the secret token plus the
// delivery's own active/expired/revoked + password policy. Audit entries are
// written with the service-role client (the staff session-client logAudit would
// fail RLS here) with user_id = null and the delivery's clinic_id.
//
// Server-only. NEVER import into client code.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicDeliveryByToken } from '@/lib/data/deliveries'
import { isDeliveryOpenable, normalizeDigits, type PasswordKind } from './policy'
import { verifyDeliveryPassword } from './secure'
import type { PublicDelivery } from '@/types/delivery'

const BUCKET = 'report-deliveries'

export type DeliveryFormat = 'pdf' | 'docx'

// Audit a public access event. Best-effort: never throws.
async function auditPublicAccess(
  action: 'report_opened' | 'report_downloaded',
  delivery: Pick<PublicDelivery, 'id' | 'clinicId' | 'reportId'>,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      user_id: null,
      clinic_id: delivery.clinicId,
      action,
      entity_type: 'report',
      entity_id: delivery.reportId,
      metadata: { ...metadata, deliveryId: delivery.id },
    })
  } catch {
    // Audit failures must never block delivery.
  }
}

async function bumpCounter(
  deliveryId: string,
  column: 'opened_count' | 'download_count',
  nowISO: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('report_deliveries')
      .select(column)
      .eq('id', deliveryId)
      .maybeSingle()
    const current = Number((data as Record<string, unknown> | null)?.[column] ?? 0)
    await admin
      .from('report_deliveries')
      .update({ [column]: current + 1, last_accessed_at: nowISO })
      .eq('id', deliveryId)
  } catch {
    // Counter bumps are non-critical.
  }
}

export interface ResolvedDelivery {
  delivery: PublicDelivery
  openable: boolean
  requiresPassword: boolean
  passwordKind: PasswordKind
}

// Resolve a token into its delivery + policy flags. Returns null when the token
// is unknown. Records a report_opened audit event when the link is openable.
export async function resolveDelivery(token: string, nowISO: string): Promise<ResolvedDelivery | null> {
  const delivery = await getPublicDeliveryByToken(token)
  if (!delivery) return null
  const openable = isDeliveryOpenable(delivery.expiresAt, delivery.revokedAt, nowISO)
  if (openable) {
    await bumpCounter(delivery.id, 'opened_count', nowISO)
    await auditPublicAccess('report_opened', delivery, { channel: delivery.channel })
  }
  return {
    delivery,
    openable,
    requiresPassword: delivery.passwordKind !== 'none',
    passwordKind: delivery.passwordKind,
  }
}

// Verify a patient-supplied password against the delivery policy. A DOB-based
// password is compared on digits only (the stored hash is of DDMMYYYY); a custom
// password is compared verbatim; 'none' always passes.
export function verifyDeliveryAccess(delivery: PublicDelivery, rawPassword: string): boolean {
  if (delivery.passwordKind === 'none') return true
  if (!delivery.passwordHash) return false
  const candidate =
    delivery.passwordKind === 'dob' ? normalizeDigits(rawPassword ?? '') : (rawPassword ?? '')
  return verifyDeliveryPassword(candidate, delivery.passwordHash)
}

// Download the frozen export file for a delivery from the private bucket.
// Returns null on any storage problem.
export async function fetchDeliveryFile(
  delivery: PublicDelivery,
  format: DeliveryFormat,
): Promise<Uint8Array | null> {
  const path = format === 'pdf' ? delivery.pdfPath : delivery.docxPath
  if (!path) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BUCKET).download(path)
    if (error || !data) return null
    return new Uint8Array(await data.arrayBuffer())
  } catch {
    return null
  }
}

export async function recordDownload(
  delivery: Pick<PublicDelivery, 'id' | 'clinicId' | 'reportId' | 'channel'>,
  format: DeliveryFormat,
  nowISO: string,
): Promise<void> {
  await bumpCounter(delivery.id, 'download_count', nowISO)
  await auditPublicAccess('report_downloaded', delivery, { channel: delivery.channel, format })
}
