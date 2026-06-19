import { describe, it, expect } from 'vitest'
import {
  countByStatus,
  monthlyRecurringRevenue,
  expiringSoon,
  monthlyCounts,
  growthRate,
  type SubscriptionMetricRow,
} from './metrics'

const PRICES = { starter: 25000, professional: 75000, enterprise: 0 }

function sub(partial: Partial<SubscriptionMetricRow>): SubscriptionMetricRow {
  return { status: 'active', planId: 'starter', ...partial }
}

describe('countByStatus', () => {
  it('tallies each status and zero-fills the rest', () => {
    const counts = countByStatus([
      sub({ status: 'active' }),
      sub({ status: 'active' }),
      sub({ status: 'trial' }),
      sub({ status: 'suspended' }),
    ])
    expect(counts).toEqual({ trial: 1, active: 2, grace: 0, suspended: 1, cancelled: 0 })
  })
})

describe('monthlyRecurringRevenue', () => {
  it('sums list price for active and grace only', () => {
    const subs = [
      sub({ status: 'active', planId: 'professional' }), // 75000
      sub({ status: 'grace', planId: 'starter' }), // 25000
      sub({ status: 'trial', planId: 'professional' }), // 0 (trial)
      sub({ status: 'cancelled', planId: 'professional' }), // 0
    ]
    expect(monthlyRecurringRevenue(subs, PRICES)).toBe(100000)
  })

  it('treats unknown plans as zero', () => {
    expect(monthlyRecurringRevenue([sub({ planId: 'enterprise' })], PRICES)).toBe(0)
  })
})

describe('expiringSoon', () => {
  const now = '2026-06-18T00:00:00.000Z'
  it('includes trials ending within the window', () => {
    const rows = expiringSoon(
      [
        sub({ status: 'trial', trialEndsAt: '2026-06-22T00:00:00.000Z' }), // 4 days
        sub({ status: 'trial', trialEndsAt: '2026-07-30T00:00:00.000Z' }), // far
      ],
      now,
      7,
    )
    expect(rows).toHaveLength(1)
  })

  it('excludes already-expired and uses grace end for grace status', () => {
    const rows = expiringSoon(
      [
        sub({ status: 'grace', graceEndsAt: '2026-06-20T00:00:00.000Z' }), // 2 days
        sub({ status: 'trial', trialEndsAt: '2026-06-10T00:00:00.000Z' }), // past
      ],
      now,
      7,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('grace')
  })
})

describe('monthlyCounts', () => {
  const now = '2026-06-18T12:00:00.000Z'
  it('buckets dates into the trailing months ending at now', () => {
    const points = monthlyCounts(
      [
        '2026-06-01T00:00:00.000Z',
        '2026-06-15T00:00:00.000Z',
        '2026-05-20T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z', // outside 6-month window
      ],
      now,
      6,
    )
    expect(points).toHaveLength(6)
    expect(points[points.length - 1]).toEqual({ month: '2026-06', count: 2 })
    expect(points[points.length - 2]).toEqual({ month: '2026-05', count: 1 })
    expect(points[0].month).toBe('2026-01')
  })
})

describe('growthRate', () => {
  it('computes percent change between last two months', () => {
    expect(growthRate([{ month: '2026-05', count: 4 }, { month: '2026-06', count: 6 }])).toBe(50)
  })
  it('returns null when prior month is zero but current is positive', () => {
    expect(growthRate([{ month: '2026-05', count: 0 }, { month: '2026-06', count: 3 }])).toBeNull()
  })
  it('returns 0 when both months are zero', () => {
    expect(growthRate([{ month: '2026-05', count: 0 }, { month: '2026-06', count: 0 }])).toBe(0)
  })
})
