// F17 — PUBLIC secure download. GET /api/delivery/:token/file?format=pdf|docx
//
// Unauthenticated by design: the secret token + the delivery's active/expired/
// revoked + password policy are the only gate. Serves the frozen export file
// (byte-identical to the F9 staff export) from the private bucket and logs a
// report_downloaded audit event. Never queries live report tables.

import type { NextRequest } from 'next/server'
import { getPublicDeliveryByToken } from '@/lib/data/deliveries'
import {
  fetchDeliveryFile,
  verifyDeliveryAccess,
  recordDownload,
  type DeliveryFormat,
} from '@/lib/delivery/access'
import { isDeliveryOpenable } from '@/lib/delivery/policy'
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
  const password = req.nextUrl.searchParams.get('pw') ?? ''

  const delivery = await getPublicDeliveryByToken(token)
  if (!delivery) return new Response('Lien introuvable', { status: 404 })

  const now = new Date().toISOString()
  if (!isDeliveryOpenable(delivery.expiresAt, delivery.revokedAt, now)) {
    return new Response('Lien expiré ou révoqué', { status: 410 })
  }
  if (!verifyDeliveryAccess(delivery, password)) {
    return new Response('Mot de passe requis', { status: 401 })
  }

  const bytes = await fetchDeliveryFile(delivery, format)
  if (!bytes) return new Response('Fichier indisponible', { status: 404 })

  await recordDownload(delivery, format, now)

  const filename = `${delivery.filenameBase}.${format}`
  return fileResponse(bytes, CONTENT_TYPE[format], filename)
}
