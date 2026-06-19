import { describe, it, expect } from 'vitest'
import {
  planBillingRun,
  summarizeActions,
  reminderKey,
  type BillingSubscription,
  type BillingRunContext,
} from './billing-run'

const NOW = '2026-06-18T00:00:00.000Z'
const PRICES = { starter: 25000, professional: 75000, enterprise: 0 }

function ctx(overrides: Partial<BillingRunContext> = {}): BillingRunContext {
  return {
    nowISO: NOW,
    priceByPlan: PRICES,
    existingReminders: new Set<string>(),
    hasOpenInvoice: new Set<string>(),
    ...overrides,
  }
}

function daysFromNow(days: number): string {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

function sub(partial: Partial<BillingSubscription>): BillingSubscription {
  return {
    id: 's1',
    clinicId: 'c1',
    status: 'active',
    planId: 'professional',
    ...partial,
  }
}

describe('planBillingRun — reminders', () => {
  it('emits trial-ending reminders at 14/7/3/0 days', () => {
    for (const day of [14, 7, 3, 0]) {
      const actions = planBillingRun([sub({ status: 'trial', trialEndsAt: daysFromNow(day) })], ctx())
      const reminder = actions.find((a) => a.kind === 'reminder')
      expect(reminder).toMatchObject({ kind: 'reminder', type: 'trial_ending', day })
    }
  })

  it('emits renewal reminders at 14/7/3/0 days for active subs', () => {
    for (const day of [14, 7, 3, 0]) {
      const actions = planBillingRun([sub({ status: 'active', currentPeriodEnd: daysFromNow(day) })], ctx())
      expect(actions.find((a) => a.kind === 'reminder')).toMatchObject({ type: 'renewal_reminder', day })
    }
  })

  it('does not remind at non-milestone days (e.g. 5)', () => {
    const actions = planBillingRun([sub({ status: 'active', currentPeriodEnd: daysFromNow(5) })], ctx())
    expect(actions.filter((a) => a.kind === 'reminder')).toHaveLength(0)
  })

  it('skips a reminder already sent (dedup)', () => {
    const existing = new Set([reminderKey('s1', 'renewal_reminder', 7)])
    const actions = planBillingRun(
      [sub({ status: 'active', currentPeriodEnd: daysFromNow(7) })],
      ctx({ existingReminders: existing }),
    )
    expect(actions.filter((a) => a.kind === 'reminder')).toHaveLength(0)
  })
})

describe('planBillingRun — lifecycle transitions', () => {
  it('lapsed active sub issues a renewal invoice and enters grace', () => {
    const actions = planBillingRun([sub({ status: 'active', currentPeriodEnd: daysFromNow(-1) })], ctx())
    expect(actions.find((a) => a.kind === 'issue_invoice')).toMatchObject({ amountXof: 75000 })
    expect(actions.find((a) => a.kind === 'transition')).toMatchObject({ to: 'grace' })
  })

  it('does not double-issue an invoice when one is already open', () => {
    const actions = planBillingRun(
      [sub({ status: 'active', currentPeriodEnd: daysFromNow(-2) })],
      ctx({ hasOpenInvoice: new Set(['s1']) }),
    )
    expect(actions.filter((a) => a.kind === 'issue_invoice')).toHaveLength(0)
    expect(actions.find((a) => a.kind === 'transition')).toMatchObject({ to: 'grace' })
  })

  it('lapsed trial issues the first invoice and enters grace', () => {
    const actions = planBillingRun([sub({ status: 'trial', trialEndsAt: daysFromNow(-1) })], ctx())
    expect(actions.find((a) => a.kind === 'issue_invoice')).toBeTruthy()
    expect(actions.find((a) => a.kind === 'transition')).toMatchObject({ to: 'grace' })
  })

  it('exhausted grace suspends the subscription', () => {
    const actions = planBillingRun([sub({ status: 'grace', graceEndsAt: daysFromNow(-1) })], ctx())
    expect(actions).toContainEqual(
      expect.objectContaining({ kind: 'transition', to: 'suspended', subscriptionId: 's1' }),
    )
  })

  it('grace warns at 3 and 0 days but not 7', () => {
    expect(
      planBillingRun([sub({ status: 'grace', graceEndsAt: daysFromNow(3) })], ctx())
        .find((a) => a.kind === 'reminder'),
    ).toMatchObject({ type: 'grace_warning', day: 3 })
    expect(
      planBillingRun([sub({ status: 'grace', graceEndsAt: daysFromNow(7) })], ctx())
        .filter((a) => a.kind === 'reminder'),
    ).toHaveLength(0)
  })

  it('enterprise (0-price) plans are not auto-invoiced', () => {
    const actions = planBillingRun(
      [sub({ status: 'active', planId: 'enterprise', currentPeriodEnd: daysFromNow(-1) })],
      ctx(),
    )
    expect(actions.filter((a) => a.kind === 'issue_invoice')).toHaveLength(0)
    expect(actions.find((a) => a.kind === 'transition')).toMatchObject({ to: 'grace' })
  })

  it('suspended/cancelled subs produce no actions', () => {
    expect(planBillingRun([sub({ status: 'suspended' })], ctx())).toHaveLength(0)
    expect(planBillingRun([sub({ status: 'cancelled' })], ctx())).toHaveLength(0)
  })
})

describe('summarizeActions', () => {
  it('counts actions by kind', () => {
    const actions = planBillingRun(
      [
        sub({ id: 'a', status: 'active', currentPeriodEnd: daysFromNow(7) }),
        sub({ id: 'b', clinicId: 'c2', status: 'active', currentPeriodEnd: daysFromNow(-1) }),
        sub({ id: 'c', clinicId: 'c3', status: 'grace', graceEndsAt: daysFromNow(-1) }),
      ],
      ctx(),
    )
    const summary = summarizeActions(actions)
    expect(summary.reminders).toBe(1)
    expect(summary.invoices).toBe(1)
    expect(summary.graced).toBe(1)
    expect(summary.suspended).toBe(1)
  })
})
