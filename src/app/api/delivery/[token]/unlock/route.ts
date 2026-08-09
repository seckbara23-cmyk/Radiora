// F17 — PUBLIC unlock check. POST /api/delivery/:token/unlock  { password }
// Returns { ok } so the gate page can reveal download buttons without leaking
// whether a token exists beyond the active/expired/revoked state.
//
// R0.5: attempts are rate-limited with a durable per-delivery lockout, and a
// successful unlock issues a short-lived HttpOnly grant cookie so the password
// never has to travel again (the download route used to take it in the URL).

import type { NextRequest } from 'next/server'
import { getPublicDeliveryByToken } from '@/lib/data/deliveries'
import { attemptDeliveryUnlock } from '@/lib/delivery/access'
import { isDeliveryOpenable } from '@/lib/delivery/policy'
import { issueGrant, grantCookieName, grantCookiePath, GRANT_TTL_SECONDS } from '@/lib/delivery/grant'

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

  const now = new Date()
  const nowISO = now.toISOString()
  if (!isDeliveryOpenable(delivery.expiresAt, delivery.revokedAt, nowISO)) {
    return Response.json({ ok: false, reason: 'unavailable' }, { status: 410 })
  }

  const { ok, lock } = await attemptDeliveryUnlock(delivery, password, nowISO)

  if (lock.locked) {
    return Response.json(
      { ok: false, reason: 'locked', retryAfterSeconds: lock.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(lock.retryAfterSeconds) } },
    )
  }
  if (!ok) return Response.json({ ok: false, reason: 'wrong' }, { status: 401 })

  // Grant is scoped to this delivery's path, so the browser never sends it
  // anywhere else, and is HttpOnly so page scripts cannot read it.
  const grant = issueGrant(delivery.id, now.getTime())
  const cookie = [
    `${grantCookieName(delivery.id)}=${grant}`,
    `Path=${grantCookiePath(token)}`,
    `Max-Age=${GRANT_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ')

  return Response.json({ ok: true }, { status: 200, headers: { 'Set-Cookie': cookie } })
}
