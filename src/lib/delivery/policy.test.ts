import { describe, it, expect } from 'vitest'
import {
  auditActionForChannel,
  isDeliveryChannel,
  isReportDeliverable,
  normalizeDigits,
  dobToPassword,
  dobInputMatches,
  addDaysISO,
  deliveryState,
  isDeliveryOpenable,
  resolveExpiryDays,
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
} from './policy'

describe('auditActionForChannel', () => {
  it('maps channels to the verbatim spec audit actions', () => {
    expect(auditActionForChannel('patient')).toBe('report_sent_patient')
    expect(auditActionForChannel('physician')).toBe('report_sent_physician')
    expect(auditActionForChannel('link')).toBe('secure_link_created')
  })
})

describe('isDeliveryChannel', () => {
  it('accepts known channels and rejects others', () => {
    expect(isDeliveryChannel('patient')).toBe(true)
    expect(isDeliveryChannel('physician')).toBe(true)
    expect(isDeliveryChannel('email')).toBe(false)
  })
})

describe('isReportDeliverable — validation gate', () => {
  it('allows finalized or signed reports only', () => {
    expect(isReportDeliverable('finalized')).toBe(true)
    expect(isReportDeliverable('in_review', '2026-06-18T10:00:00Z')).toBe(true)
    expect(isReportDeliverable('draft')).toBe(false)
    expect(isReportDeliverable('in_review')).toBe(false)
    expect(isReportDeliverable('draft', null)).toBe(false)
  })
})

describe('dobToPassword / normalizeDigits / dobInputMatches', () => {
  it('derives DDMMYYYY from an ISO date', () => {
    expect(dobToPassword('1990-07-02')).toBe('02071990')
    expect(dobToPassword('1990-07-02T00:00:00Z')).toBe('02071990')
  })

  it('returns null for missing or invalid dates', () => {
    expect(dobToPassword('')).toBeNull()
    expect(dobToPassword(null)).toBeNull()
    expect(dobToPassword('not-a-date')).toBeNull()
  })

  it('strips non-digit characters', () => {
    expect(normalizeDigits('02/07/1990')).toBe('02071990')
    expect(normalizeDigits('02 07 1990')).toBe('02071990')
  })

  it('matches DOB input regardless of separators', () => {
    expect(dobInputMatches('1990-07-02', '02/07/1990')).toBe(true)
    expect(dobInputMatches('1990-07-02', '02071990')).toBe(true)
    expect(dobInputMatches('1990-07-02', '01011990')).toBe(false)
    expect(dobInputMatches(null, '02071990')).toBe(false)
  })
})

describe('addDaysISO', () => {
  it('adds whole days', () => {
    expect(addDaysISO('2026-06-18T00:00:00.000Z', 7)).toBe('2026-06-25T00:00:00.000Z')
  })
  it('returns the input unchanged when unparseable', () => {
    expect(addDaysISO('garbage', 7)).toBe('garbage')
  })
})

describe('deliveryState / isDeliveryOpenable', () => {
  const now = '2026-06-18T12:00:00Z'

  it('is active before expiry with no revocation', () => {
    expect(deliveryState('2026-06-25T12:00:00Z', null, now)).toBe('active')
    expect(isDeliveryOpenable('2026-06-25T12:00:00Z', null, now)).toBe(true)
  })

  it('is expired once now passes expiry', () => {
    expect(deliveryState('2026-06-17T12:00:00Z', null, now)).toBe('expired')
    expect(isDeliveryOpenable('2026-06-17T12:00:00Z', null, now)).toBe(false)
  })

  it('revoked wins over expiry', () => {
    expect(deliveryState('2026-06-25T12:00:00Z', '2026-06-18T08:00:00Z', now)).toBe('revoked')
    expect(deliveryState('2026-06-17T12:00:00Z', '2026-06-18T08:00:00Z', now)).toBe('revoked')
  })

  it('with no expiry, stays active unless revoked', () => {
    expect(deliveryState(null, null, now)).toBe('active')
    expect(deliveryState(null, '2026-06-18T08:00:00Z', now)).toBe('revoked')
  })
})

// R0.5 — a delivery link carries a frozen copy of a patient's report, so an
// unbounded link means a token leaked over WhatsApp stays live forever.
// "No expiry" is no longer expressible.
describe('resolveExpiryDays', () => {
  it('defaults when the caller supplies nothing', () => {
    expect(resolveExpiryDays(null)).toBe(DEFAULT_EXPIRY_DAYS)
    expect(resolveExpiryDays(undefined)).toBe(DEFAULT_EXPIRY_DAYS)
  })

  it('never returns a value that would mean "never expires"', () => {
    for (const bad of [0, -1, -9999, Number.NaN, Number.POSITIVE_INFINITY]) {
      const days = resolveExpiryDays(bad)
      expect(days).toBeGreaterThan(0)
      expect(days).toBeLessThanOrEqual(MAX_EXPIRY_DAYS)
    }
  })

  it('caps an over-long request at the maximum', () => {
    expect(resolveExpiryDays(3650)).toBe(MAX_EXPIRY_DAYS)
    expect(resolveExpiryDays(MAX_EXPIRY_DAYS + 1)).toBe(MAX_EXPIRY_DAYS)
  })

  it('honours a sensible request', () => {
    expect(resolveExpiryDays(7)).toBe(7)
    expect(resolveExpiryDays(MAX_EXPIRY_DAYS)).toBe(MAX_EXPIRY_DAYS)
    expect(resolveExpiryDays(7.9)).toBe(7)
  })
})

// R0.8B — the database now refuses a NULL / out-of-window expiry outright
// (migration 043: NOT NULL + report_deliveries_expiry_window). These pin the
// application half of the same contract, so the two cannot drift.
describe('delivery expiry contract (R0.8B)', () => {
  it('the default lifetime is no more than 30 days', () => {
    expect(DEFAULT_EXPIRY_DAYS).toBeLessThanOrEqual(30)
    expect(resolveExpiryDays(undefined)).toBeLessThanOrEqual(30)
  })

  it('the maximum matches the database window (90 days)', () => {
    expect(MAX_EXPIRY_DAYS).toBe(90)
  })

  it('"never expires" cannot be requested through any input', () => {
    // Every shape a caller could use to mean "no expiry" still yields a finite,
    // in-window lifetime — there is no value that disables expiry.
    const neverAttempts = [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]
    for (const attempt of neverAttempts) {
      const days = resolveExpiryDays(attempt)
      expect(Number.isFinite(days), `input ${String(attempt)} must yield a finite lifetime`).toBe(true)
      expect(days).toBeGreaterThan(0)
      expect(days).toBeLessThanOrEqual(MAX_EXPIRY_DAYS)
    }
  })

  it('an over-long request is clamped, never rejected into a NULL expiry', () => {
    // The application contract is clamp-not-fail, so a delivery is always
    // created WITH an expiry rather than falling back to "no expiry".
    expect(resolveExpiryDays(365)).toBe(MAX_EXPIRY_DAYS)
  })

  it('every resolved lifetime satisfies the database CHECK window', () => {
    const created = Date.parse('2026-08-09T12:00:00.000Z')
    for (const request of [null, undefined, 0, 1, 7, 30, 90, 91, 100000]) {
      const expires = created + resolveExpiryDays(request) * 86_400_000
      // expires_at > created_at AND expires_at <= created_at + 90 days
      expect(expires).toBeGreaterThan(created)
      expect(expires).toBeLessThanOrEqual(created + MAX_EXPIRY_DAYS * 86_400_000)
    }
  })
})
