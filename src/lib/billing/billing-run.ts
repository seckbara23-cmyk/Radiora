// Phase 4E — deterministic billing-cycle planner.
//
// Given the current subscriptions plus context (now, plan prices, which
// reminders already went out, which subscriptions already have an open
// invoice), this PURE function decides what the billing cycle should do:
// send 7/3/0-day reminders, issue renewal invoices, and advance the lifecycle
// (active/trial → grace → suspended). It performs no IO so it is fully
// unit-testable; the runner action executes the returned actions.

import { daysUntil, type PlanId, type SubscriptionStatus } from './subscription'
import { addDaysISO } from './payments'

// Reminder milestones (days before the relevant end date), per the spec:
// notify 14 days, 7 days, 3 days, and on the expiration day.
export const REMINDER_DAYS = [14, 7, 3, 0] as const

// Grace window granted once a paid period or trial lapses before suspension.
export const GRACE_DAYS = 7

export interface BillingSubscription {
  id: string
  clinicId: string
  status: SubscriptionStatus
  planId: PlanId
  trialEndsAt?: string | null
  currentPeriodEnd?: string | null
  graceEndsAt?: string | null
}

export type ReminderType = 'trial_ending' | 'renewal_reminder' | 'grace_warning'

export type BillingAction =
  | {
      kind: 'reminder'
      type: ReminderType
      day: number
      subscriptionId: string
      clinicId: string
      endsAt: string
    }
  | {
      kind: 'issue_invoice'
      subscriptionId: string
      clinicId: string
      planId: PlanId
      amountXof: number
      periodStart: string
      periodEnd: string
    }
  | {
      kind: 'transition'
      to: 'grace' | 'suspended'
      subscriptionId: string
      clinicId: string
      graceEndsAt?: string
    }

export interface BillingRunContext {
  nowISO: string
  priceByPlan: Record<string, number>
  // Keys `${subscriptionId}:${type}:${day}` for reminders already recorded.
  existingReminders: Set<string>
  // Subscription ids that already have an unpaid (open/draft) invoice.
  hasOpenInvoice: Set<string>
}

export function reminderKey(subscriptionId: string, type: ReminderType, day: number): string {
  return `${subscriptionId}:${type}:${day}`
}

function isMilestone(day: number | null, milestones: readonly number[]): day is number {
  return day !== null && milestones.includes(day)
}

export function planBillingRun(
  subs: BillingSubscription[],
  ctx: BillingRunContext,
): BillingAction[] {
  const actions: BillingAction[] = []
  const { nowISO } = ctx

  const pushReminder = (sub: BillingSubscription, type: ReminderType, day: number, endsAt: string) => {
    if (ctx.existingReminders.has(reminderKey(sub.id, type, day))) return
    actions.push({ kind: 'reminder', type, day, subscriptionId: sub.id, clinicId: sub.clinicId, endsAt })
  }

  const issueInvoice = (sub: BillingSubscription, periodStart: string) => {
    if (ctx.hasOpenInvoice.has(sub.id)) return
    const amount = ctx.priceByPlan[sub.planId] ?? 0
    if (amount <= 0) return // enterprise / custom pricing is invoiced manually
    actions.push({
      kind: 'issue_invoice',
      subscriptionId: sub.id,
      clinicId: sub.clinicId,
      planId: sub.planId,
      amountXof: amount,
      periodStart,
      periodEnd: addDaysISO(periodStart, 30),
    })
  }

  for (const sub of subs) {
    if (sub.status === 'trial') {
      const end = sub.trialEndsAt ?? null
      const left = end ? daysUntil(end, nowISO) : null
      if (end && isMilestone(left, REMINDER_DAYS)) pushReminder(sub, 'trial_ending', left, end)
      // Trial lapsed: issue the first invoice and open a grace window.
      if (left !== null && left < 0) {
        issueInvoice(sub, nowISO)
        actions.push({
          kind: 'transition', to: 'grace', subscriptionId: sub.id, clinicId: sub.clinicId,
          graceEndsAt: addDaysISO(nowISO, GRACE_DAYS),
        })
      }
    } else if (sub.status === 'active') {
      const end = sub.currentPeriodEnd ?? null
      const left = end ? daysUntil(end, nowISO) : null
      if (end && isMilestone(left, REMINDER_DAYS)) pushReminder(sub, 'renewal_reminder', left, end)
      // Period ended and unpaid: issue the renewal invoice and enter grace.
      if (left !== null && left < 0) {
        issueInvoice(sub, end ?? nowISO)
        actions.push({
          kind: 'transition', to: 'grace', subscriptionId: sub.id, clinicId: sub.clinicId,
          graceEndsAt: addDaysISO(nowISO, GRACE_DAYS),
        })
      }
    } else if (sub.status === 'grace') {
      const end = sub.graceEndsAt ?? null
      const left = end ? daysUntil(end, nowISO) : null
      // Final warnings at 3 and 0 days of grace.
      if (end && isMilestone(left, [3, 0])) pushReminder(sub, 'grace_warning', left, end)
      // Grace exhausted: suspend.
      if (left !== null && left < 0) {
        actions.push({ kind: 'transition', to: 'suspended', subscriptionId: sub.id, clinicId: sub.clinicId })
      }
    }
    // suspended / cancelled: no automated action.
  }

  return actions
}

export interface BillingRunSummary {
  reminders: number
  invoices: number
  graced: number
  suspended: number
}

export function summarizeActions(actions: BillingAction[]): BillingRunSummary {
  return {
    reminders: actions.filter((a) => a.kind === 'reminder').length,
    invoices: actions.filter((a) => a.kind === 'issue_invoice').length,
    graced: actions.filter((a) => a.kind === 'transition' && a.to === 'grace').length,
    suspended: actions.filter((a) => a.kind === 'transition' && a.to === 'suspended').length,
  }
}
