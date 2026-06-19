import { describe, it, expect } from 'vitest'
import {
  daysSince,
  conversionFunnel,
  classifyEngagement,
  summariseEngagement,
  trialUrgency,
} from './customer-success'

const NOW = '2026-06-18T12:00:00.000Z'

describe('daysSince', () => {
  it('returns null for missing or unparseable input', () => {
    expect(daysSince(null, NOW)).toBeNull()
    expect(daysSince(undefined, NOW)).toBeNull()
    expect(daysSince('not-a-date', NOW)).toBeNull()
  })

  it('counts whole days into the past', () => {
    expect(daysSince('2026-06-18T00:00:00.000Z', NOW)).toBe(0)
    expect(daysSince('2026-06-15T12:00:00.000Z', NOW)).toBe(3)
    expect(daysSince('2026-05-19T12:00:00.000Z', NOW)).toBe(30)
  })
})

describe('conversionFunnel', () => {
  it('buckets statuses and ignores clinics with no subscription', () => {
    const rows = [
      { status: 'trial' as const },
      { status: 'trial' as const },
      { status: 'active' as const },
      { status: 'grace' as const },
      { status: 'cancelled' as const },
      { status: null },
    ]
    const f = conversionFunnel(rows, 8)
    expect(f.totalClinics).toBe(8)
    expect(f.withSubscription).toBe(5)
    expect(f.trialing).toBe(2)
    expect(f.paying).toBe(2)
    expect(f.churned).toBe(1)
    // resolved = paying(2) + churned(1) = 3 → 2/3 = 67%
    expect(f.conversionRate).toBe(67)
  })

  it('reports 0% conversion when nothing has resolved yet', () => {
    const f = conversionFunnel([{ status: 'trial' }, { status: 'trial' }], 2)
    expect(f.conversionRate).toBe(0)
    expect(f.paying).toBe(0)
  })

  it('handles an empty platform', () => {
    const f = conversionFunnel([], 0)
    expect(f).toEqual({
      totalClinics: 0,
      withSubscription: 0,
      trialing: 0,
      paying: 0,
      churned: 0,
      conversionRate: 0,
    })
  })
})

describe('classifyEngagement', () => {
  it('treats a young clinic with no login as new', () => {
    expect(classifyEngagement(null, '2026-06-14T12:00:00.000Z', NOW)).toBe('new')
  })

  it('treats an old clinic with no login as dormant', () => {
    expect(classifyEngagement(null, '2026-01-01T12:00:00.000Z', NOW)).toBe('dormant')
  })

  it('classifies by login recency', () => {
    expect(classifyEngagement('2026-06-17T12:00:00.000Z', '2026-01-01T00:00:00.000Z', NOW)).toBe('active')
    expect(classifyEngagement('2026-06-04T12:00:00.000Z', '2026-01-01T00:00:00.000Z', NOW)).toBe('at_risk')
    expect(classifyEngagement('2026-05-01T12:00:00.000Z', '2026-01-01T00:00:00.000Z', NOW)).toBe('dormant')
  })
})

describe('summariseEngagement', () => {
  it('tallies each level', () => {
    const counts = summariseEngagement(
      [
        { lastLoginISO: '2026-06-17T12:00:00.000Z', createdAtISO: '2026-01-01T00:00:00.000Z' }, // active
        { lastLoginISO: '2026-06-05T12:00:00.000Z', createdAtISO: '2026-01-01T00:00:00.000Z' }, // at_risk
        { lastLoginISO: null, createdAtISO: '2026-06-15T00:00:00.000Z' }, // new
        { lastLoginISO: null, createdAtISO: '2026-01-01T00:00:00.000Z' }, // dormant
      ],
      NOW,
    )
    expect(counts).toEqual({ new: 1, active: 1, at_risk: 1, dormant: 1 })
  })
})

describe('trialUrgency', () => {
  it('returns null when there is no trial end date', () => {
    expect(trialUrgency(null, NOW)).toBeNull()
  })

  it('grades urgency by days remaining', () => {
    expect(trialUrgency('2026-06-10T12:00:00.000Z', NOW)).toBe('expired')
    expect(trialUrgency('2026-06-20T12:00:00.000Z', NOW)).toBe('critical')
    expect(trialUrgency('2026-06-28T12:00:00.000Z', NOW)).toBe('upcoming')
    expect(trialUrgency('2026-07-30T12:00:00.000Z', NOW)).toBe('comfortable')
  })
})
