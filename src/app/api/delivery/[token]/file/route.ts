// F17 — PUBLIC secure download. GET /api/delivery/:token/file?format=pdf|docx
//
// Unauthenticated by design: the secret token + the delivery's active/expired/
// revoked + password policy are the only gate. Serves the frozen export file
// (byte-identical to the F9 staff export) from the private bucket and logs a
// report_downloaded audit event. Never queries live report tables.
//
// R0.5: the password is NO LONGER accepted as a `?pw=` query parameter — that
// wrote the patient's date of birth into access logs, proxy logs, browser
// history and Referer headers. A password-protected delivery is now unlocked
// once via POST /unlock, which sets a short-lived HttpOnly grant cookie that
// this route verifies.

import type { NextRequest } from 'next/server'
import { getPublicDeliveryByToken } from '@/lib/data/deliveries'
import {
  fetchDeliveryFile,
  recordDownload,
  deliveryLockStatus,
  type DeliveryFormat,
} from '@/lib/delivery/access'
import { isDeliveryOpenable } from '@/lib/delivery/policy'
import { verifyGrant, grantCookieName } from '@/lib/delivery/grant'
import { fileResponse } from '@/lib/export/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPE: Record<DeliveryFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const format: DeliveryFormat = req.nextUrl.searchParams.get('format') === 'docx' ? 'docx' : 'pdf'

  const delivery = await getPublicDeliveryByToken(token)
  if (!delivery) return new Response('Lien introuvable', { status: 404 })

  const now = new Date()
  const nowISO = now.toISOString()
  if (!isDeliveryOpenable(delivery.expiresAt, delivery.revokedAt, nowISO)) {
    return new Response('Lien expiré ou révoqué', { status: 410 })
  }

  // A locked-out link stays shut for downloads too, not just for guesses.
  const lock = deliveryLockStatus(delivery, nowISO)
  if (lock.locked) {
    return new Response('Trop de tentatives. Réessayez plus tard.', {
      status: 429,
      headers: { 'Retry-After': String(lock.retryAfterSeconds) },
    })
  }

  if (delivery.passwordKind !== 'none') {
    const cookie = req.cookies.get(grantCookieName(delivery.id))?.value
    if (!verifyGrant(delivery.id, cookie, now.getTime())) {
      return new Response('Déverrouillage requis', { status: 401 })
    }
  }

  const bytes = await fetchDeliveryFile(delivery, format)
  if (!bytes) return new Response('Fichier indisponible', { status: 404 })

  await recordDownload(delivery, format, nowISO)

  const filename = `${delivery.filenameBase}.${format}`
  return fileResponse(bytes, CONTENT_TYPE[format], filename)
}
