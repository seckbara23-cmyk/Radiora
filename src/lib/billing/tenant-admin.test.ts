import { describe, it, expect } from 'vitest'
import {
  PLAN_RANK,
  classifyPlanChange,
  isPlanChangeTarget,
  clampTrialExtensionDays,
  extendTrialEnd,
} from './tenant-admin'

describe('classifyPlanChange', () => {
  it('detects upgrades by rank', () => {
    expect(classifyPlanChange('starter', 'professional')).toBe('upgrade')
    expect(classifyPlanChange('professional', 'enterprise')).toBe('upgrade')
    expect(classifyPlanChange('starter', 'enterprise')).toBe('upgrade')
  })

  it('detects downgrades by rank', () => {
    expect(classifyPlanChange('enterprise', 'professional')).toBe('downgrade')
    expect(classifyPlanChange('professional', 'starter')).toBe('downgrade')
  })

  it('reports unchanged for same plan', () => {
    expect(classifyPlanChange('professional', 'professional')).toBe('unchanged')
  })

  it('orders the ranks low→high', () => {
    expect(PLAN_RANK.starter).toBeLessThan(PLAN_RANK.professional)
    expect(PLAN_RANK.professional).toBeLessThan(PLAN_RANK.enterprise)
  })
})

describe('isPlanChangeTarget', () => {
  it('accepts known plans, rejects junk', () => {
    expect(isPlanChangeTarget('starter')).toBe(true)
    expect(isPlanChangeTarget('enterprise')).toBe(true)
    expect(isPlanChangeTarget('platinum')).toBe(false)
    expect(isPlanChangeTarget('')).toBe(false)
  })
})

describe('clampTrialExtensionDays', () => {
  it('clamps to [1, 90] and floors', () => {
    expect(clampTrialExtensionDays(0)).toBe(1)
    expect(clampTrialExtensionDays(-5)).toBe(1)
    expect(clampTrialExtensionDays(14.9)).toBe(14)
    expect(clampTrialExtensionDays(1000)).toBe(90)
    expect(clampTrialExtensionDays(NaN)).toBe(1)
  })
})

describe('extendTrialEnd', () => {
  const now = '2026-06-18T00:00:00.000Z'

  it('extends from the existing end when the trial is still active', () => {
    const end = '2026-06-25T00:00:00.000Z' // 7 days out
    const result = extendTrialEnd(end, 14, now)
    expect(result).toBe('2026-07-09T00:00:00.000Z') // 25 Jun + 14 days
  })

  it('extends from now when the trial already lapsed', () => {
    const end = '2026-06-01T00:00:00.000Z' // in the past
    const result = extendTrialEnd(end, 30, now)
    expect(result).toBe('2026-07-18T00:00:00.000Z') // now + 30 days
  })

  it('extends from now when there is no existing trial end', () => {
    expect(extendTrialEnd(null, 30, now)).toBe('2026-07-18T00:00:00.000Z')
  })

  it('applies the clamp', () => {
    expect(extendTrialEnd(null, 1000, now)).toBe('2026-09-16T00:00:00.000Z') // now + 90
  })
})
