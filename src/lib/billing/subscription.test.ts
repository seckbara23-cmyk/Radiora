import { describe, it, expect } from 'vitest'
import {
  isSubscriptionStatus,
  isPlanId,
  daysUntil,
  computeAccess,
  shouldWarnExpiry,
  planLimits,
  withinUserLimit,
} from './subscription'

const now = '2026-06-19T12:00:00Z'

describe('guards', () => {
  it('validates statuses and plan ids', () => {
    expect(isSubscriptionStatus('trial')).toBe(true)
    expect(isSubscriptionStatus('nope')).toBe(false)
    expect(isPlanId('professional')).toBe(true)
    expect(isPlanId('gold')).toBe(false)
  })
})

describe('daysUntil', () => {
  it('counts whole days ahead and behind', () => {
    expect(daysUntil('2026-06-26T12:00:00Z', now)).toBe(7)
    expect(daysUntil('2026-06-18T12:00:00Z', now)).toBe(-1)
    expect(daysUntil(null, now)).toBeNull()
  })
})

describe('computeAccess', () => {
  it('fails open when there is no subscription', () => {
    const a = computeAccess(null, now)
    expect(a.state).toBe('active')
    expect(a.canWrite).toBe(true)
  })

  it('trial within window is writable and reports days left', () => {
    const a = computeAccess({ status: 'trial', trialEndsAt: '2026-06-29T12:00:00Z' }, now)
    expect(a.state).toBe('trialing')
    expect(a.canWrite).toBe(true)
    expect(a.daysLeft).toBe(10)
  })

  it('expired trial becomes read-only', () => {
    const a = computeAccess({ status: 'trial', trialEndsAt: '2026-06-10T12:00:00Z' }, now)
    expect(a.state).toBe('expired')
    expect(a.canWrite).toBe(false)
    expect(a.readOnly).toBe(true)
  })

  it('active is writable', () => {
    const a = computeAccess(
      { status: 'active', currentPeriodEnd: '2026-07-19T12:00:00Z' },
      now,
    )
    expect(a.state).toBe('active')
    expect(a.canWrite).toBe(true)
    expect(a.daysLeft).toBe(30)
  })

  it('grace within window stays writable; past grace is suspended', () => {
    expect(computeAccess({ status: 'grace', graceEndsAt: '2026-06-22T12:00:00Z' }, now).canWrite).toBe(true)
    const lapsed = computeAccess({ status: 'grace', graceEndsAt: '2026-06-15T12:00:00Z' }, now)
    expect(lapsed.state).toBe('suspended')
    expect(lapsed.canWrite).toBe(false)
  })

  it('suspended and cancelled are read-only', () => {
    expect(computeAccess({ status: 'suspended' }, now).readOnly).toBe(true)
    expect(computeAccess({ status: 'cancelled' }, now).readOnly).toBe(true)
  })
})

describe('shouldWarnExpiry', () => {
  it('warns when a trial is within the threshold', () => {
    const trialing = computeAccess({ status: 'trial', trialEndsAt: '2026-06-23T12:00:00Z' }, now)
    expect(shouldWarnExpiry(trialing)).toBe(true)
  })
  it('does not warn for a healthy active subscription far from renewal', () => {
    const active = computeAccess({ status: 'active', currentPeriodEnd: '2026-07-19T12:00:00Z' }, now)
    expect(shouldWarnExpiry(active)).toBe(false)
  })
})

describe('plan limits', () => {
  it('exposes the documented limits', () => {
    expect(planLimits('starter')).toEqual({ maxRadiologists: 1, maxSecretaries: 2 })
    expect(planLimits('professional').maxRadiologists).toBe(10)
    expect(planLimits('enterprise')).toEqual({ maxRadiologists: null, maxSecretaries: null })
    expect(planLimits('unknown')).toEqual(planLimits('starter'))
  })

  it('enforces radiologist and secretary caps, unlimited = always allowed', () => {
    expect(withinUserLimit('starter', 'radiologist', 0)).toBe(true)
    expect(withinUserLimit('starter', 'radiologist', 1)).toBe(false)
    expect(withinUserLimit('starter', 'secretary', 1)).toBe(true)
    expect(withinUserLimit('starter', 'secretary', 2)).toBe(false)
    expect(withinUserLimit('professional', 'secretary', 999)).toBe(true)
    expect(withinUserLimit('enterprise', 'radiologist', 999)).toBe(true)
  })
})
