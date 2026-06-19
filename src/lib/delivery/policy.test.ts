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
