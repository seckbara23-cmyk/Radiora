// F17 — PUBLIC unlock check. POST /api/delivery/:token/unlock  { password }
// Returns { ok } so the gate page can reveal download buttons without leaking
// whether a token exists beyond the active/expired/revoked state.

import type { NextRequest } from 'next/server'
import { getPublicDeliveryByToken } from '@/lib/data/deliveries'
import { verifyDeliveryAccess } from '@/lib/delivery/access'
import { isDeliveryOpenable } from '@/lib/delivery/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  let password = ''
  try {
    const body = (await req.json()) as { password?: string }
    password = body.password ?? ''
  } catch {
    /* empty body */
  }

  const delivery = await getPublicDeliveryByToken(token)
  if (!delivery) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })

  const now = new Date().toISOString()
  if (!isDeliveryOpenable(delivery.expiresAt, delivery.revokedAt, now)) {
    return Response.json({ ok: false, reason: 'unavailable' }, { status: 410 })
  }

  const ok = verifyDeliveryAccess(delivery, password)
  return Response.json({ ok }, { status: ok ? 200 : 401 })
}
