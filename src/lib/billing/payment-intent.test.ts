import { describe, it, expect } from 'vitest'
import { isPaymentPurpose, purposeForPlanChange, upgradeChargeXof } from './payment-intent'

describe('isPaymentPurpose', () => {
  it('accepts the three known purposes only', () => {
    expect(isPaymentPurpose('subscription')).toBe(true)
    expect(isPaymentPurpose('renewal')).toBe(true)
    expect(isPaymentPurpose('upgrade')).toBe(true)
    expect(isPaymentPurpose('refund')).toBe(false)
    expect(isPaymentPurpose('')).toBe(false)
  })
})

describe('purposeForPlanChange', () => {
  it('only an upgrade is billable', () => {
    expect(purposeForPlanChange('upgrade')).toBe('upgrade')
    expect(purposeForPlanChange('downgrade')).toBeNull()
    expect(purposeForPlanChange('unchanged')).toBeNull()
  })
})

describe('upgradeChargeXof', () => {
  it('charges the floored target price', () => {
    expect(upgradeChargeXof(75000)).toBe(75000)
    expect(upgradeChargeXof(75000.9)).toBe(75000)
  })
  it('returns 0 for non-purchasable prices (contact-sales)', () => {
    expect(upgradeChargeXof(0)).toBe(0)
    expect(upgradeChargeXof(-100)).toBe(0)
    expect(upgradeChargeXof(Number.NaN)).toBe(0)
  })
})
