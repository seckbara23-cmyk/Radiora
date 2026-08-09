// F17 — Secure report delivery: pure, deterministic policy helpers.
//
// These encode the rules that govern secure delivery and are unit-tested in
// isolation (no IO, no crypto, no network):
//   * only validated (finalized/signed) reports may be delivered;
//   * a delivery link is active, expired, or revoked;
//   * a DOB-based password is derived deterministically from the patient's date
//     of birth so the patient can unlock without a separately-shared secret.

export type DeliveryChannel = 'patient' | 'physician' | 'link'
export const DELIVERY_CHANNELS: DeliveryChannel[] = ['patient', 'physician', 'link']

export type DeliveryState = 'active' | 'expired' | 'revoked'
export type PasswordKind = 'none' | 'custom' | 'dob'

// Audit action names are taken verbatim from the F17 spec.
export function auditActionForChannel(channel: DeliveryChannel): string {
  switch (channel) {
    case 'patient':
      return 'report_sent_patient'
    case 'physician':
      return 'report_sent_physician'
    default:
      return 'secure_link_created'
  }
}

export function isDeliveryChannel(value: string): value is DeliveryChannel {
  return (DELIVERY_CHANNELS as readonly string[]).includes(value)
}

// Only a validated report may be delivered — this mirrors the export gate and
// must never be bypassed by the delivery flow.
export function isReportDeliverable(status: string, signedAt?: string | null): boolean {
  return status === 'finalized' || Boolean(signedAt)
}

// Keep only digits — used to normalise a date-of-birth password typed by a patient.
export function normalizeDigits(raw: string): string {
  return (raw ?? '').replace(/\D+/g, '')
}

// Derive the canonical DOB password (DDMMYYYY) from an ISO date 'YYYY-MM-DD'.
// Returns null when the date is missing or unparseable.
export function dobToPassword(isoDate: string | null | undefined): string | null {
  const v = (isoDate ?? '').trim()
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, year, month, day] = m
  return `${day}${month}${year}`
}

// A patient may type their DOB in any separator style; compare on digits only.
export function dobInputMatches(isoDate: string | null | undefined, typed: string): boolean {
  const expected = dobToPassword(isoDate)
  if (!expected) return false
  return normalizeDigits(typed) === expected
}

export function addDaysISO(fromISO: string, days: number): string {
  const base = new Date(fromISO)
  if (Number.isNaN(base.getTime())) return fromISO
  return new Date(base.getTime() + days * 86_400_000).toISOString()
}

// ── R0.5 — expiry is mandatory ────────────────────────────────────────────────
// A delivery link carries a frozen copy of a patient's report. An unbounded
// link means a token leaked through WhatsApp/SMS/email stays live forever, so
// "no expiry" is no longer expressible: an omitted or out-of-range value is
// clamped into [1, MAX_EXPIRY_DAYS] instead of becoming NULL.

export const DEFAULT_EXPIRY_DAYS = 30
export const MAX_EXPIRY_DAYS = 90

export function resolveExpiryDays(requested: number | null | undefined): number {
  if (requested === null || requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_EXPIRY_DAYS
  }
  const whole = Math.floor(requested)
  if (whole < 1) return DEFAULT_EXPIRY_DAYS
  return Math.min(whole, MAX_EXPIRY_DAYS)
}

// Resolve the current state of a delivery link. revoked wins over expired.
export function deliveryState(
  expiresAtISO: string | null | undefined,
  revokedAtISO: string | null | undefined,
  nowISO: string,
): DeliveryState {
  if (revokedAtISO) return 'revoked'
  if (expiresAtISO) {
    const expires = new Date(expiresAtISO).getTime()
    const now = new Date(nowISO).getTime()
    if (!Number.isNaN(expires) && !Number.isNaN(now) && now > expires) return 'expired'
  }
  return 'active'
}

export function isDeliveryOpenable(
  expiresAtISO: string | null | undefined,
  revokedAtISO: string | null | undefined,
  nowISO: string,
): boolean {
  return deliveryState(expiresAtISO, revokedAtISO, nowISO) === 'active'
}
