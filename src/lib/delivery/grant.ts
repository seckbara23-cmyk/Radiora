// R0.5 — short-lived download grant for the PUBLIC delivery path.
//
// The password used to travel to the download route as `?pw=<secret>`, which
// writes the patient's date of birth into server access logs, proxy logs,
// browser history and any Referer header. Instead, a successful unlock issues an
// HMAC-signed grant stored in an HttpOnly cookie scoped to that one delivery;
// the download route verifies the grant and never sees a password at all.
//
// Server-only. NEVER import into client code.

import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** How long an unlock stays valid — long enough to download both formats. */
export const GRANT_TTL_SECONDS = 30 * 60

function secret(): string {
  // A dedicated secret is preferred; the service-role key is a server-only
  // value that is already mandatory for this deployment, so it is a safe
  // fallback that keeps the feature working without new configuration.
  const value = process.env.DELIVERY_GRANT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) throw new Error('Missing DELIVERY_GRANT_SECRET / SUPABASE_SERVICE_ROLE_KEY')
  return value
}

function sign(deliveryId: string, expEpochSeconds: number): string {
  return createHmac('sha256', secret())
    .update(`${deliveryId}.${expEpochSeconds}`)
    .digest('base64url')
}

/** Cookie name for a delivery's grant. Scoped per delivery id. */
export function grantCookieName(deliveryId: string): string {
  return `rdg_${deliveryId.replace(/[^a-zA-Z0-9]/g, '')}`
}

/** Cookie Path so the browser only ever sends the grant to this delivery. */
export function grantCookiePath(token: string): string {
  return `/api/delivery/${encodeURIComponent(token)}`
}

export function issueGrant(deliveryId: string, nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + GRANT_TTL_SECONDS
  return `${exp}.${sign(deliveryId, exp)}`
}

export function verifyGrant(
  deliveryId: string,
  raw: string | null | undefined,
  nowMs: number,
): boolean {
  const value = (raw ?? '').trim()
  if (!value) return false

  const sep = value.indexOf('.')
  if (sep <= 0) return false

  const expPart = value.slice(0, sep)
  const sigPart = value.slice(sep + 1)
  const exp = Number(expPart)
  if (!Number.isFinite(exp)) return false
  if (Math.floor(nowMs / 1000) >= exp) return false

  try {
    const expected = Buffer.from(sign(deliveryId, exp))
    const provided = Buffer.from(sigPart)
    return expected.length === provided.length && timingSafeEqual(expected, provided)
  } catch {
    return false
  }
}
