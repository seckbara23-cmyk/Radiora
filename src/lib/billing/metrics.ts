// Phase 4B — pure aggregation for the Super Admin billing & analytics views.
//
// All functions are deterministic and IO-free: callers pass already-fetched
// rows plus an explicit `nowISO`, so they are unit-testable and never touch
// clinical content. They operate purely on subscription/billing/usage METADATA.

import {
  daysUntil,
  type PlanId,
  type SubscriptionStatus,
} from './subscription'

export interface SubscriptionMetricRow {
  status: SubscriptionStatus
  planId: PlanId
  trialEndsAt?: string | null
  graceEndsAt?: string | null
  currentPeriodEnd?: string | null
}

export type StatusCounts = Record<SubscriptionStatus, number>

export function countByStatus(subs: SubscriptionMetricRow[]): StatusCounts {
  const counts: StatusCounts = {
    trial: 0,
    active: 0,
    grace: 0,
    suspended: 0,
    cancelled: 0,
  }
  for (const s of subs) {
    if (s.status in counts) counts[s.status] += 1
  }
  return counts
}

// Monthly recurring revenue: the summed list price of every paying (active or
// grace) subscription. Trials and cancelled/suspended clinics contribute 0.
export function monthlyRecurringRevenue(
  subs: SubscriptionMetricRow[],
  priceByPlan: Record<string, number>,
): number {
  return subs
    .filter((s) => s.status === 'active' || s.status === 'grace')
    .reduce((sum, s) => sum + (priceByPlan[s.planId] ?? 0), 0)
}

// The effective period-end a subscription is counting down to, by status.
function effectiveEnd(s: SubscriptionMetricRow): string | null {
  if (s.status === 'trial') return s.trialEndsAt ?? null
  if (s.status === 'grace') return s.graceEndsAt ?? null
  if (s.status === 'active') return s.currentPeriodEnd ?? null
  return null
}

// Subscriptions whose trial / grace / period ends within `days` (inclusive,
// and not already past). Used for the "expiring soon" panel and reminders.
export function expiringSoon(
  subs: SubscriptionMetricRow[],
  nowISO: string,
  days = 7,
): SubscriptionMetricRow[] {
  return subs.filter((s) => {
    const end = effectiveEnd(s)
    if (!end) return false
    const left = daysUntil(end, nowISO)
    return left !== null && left >= 0 && left <= days
  })
}

export interface MonthlyPoint {
  month: string // 'YYYY-MM'
  count: number
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

// Build the last `months` month buckets ending at the month of `nowISO`, then
// tally how many of `isoDates` fall in each. Months with no data report 0.
export function monthlyCounts(
  isoDates: string[],
  nowISO: string,
  months = 6,
): MonthlyPoint[] {
  const now = new Date(nowISO)
  const buckets: MonthlyPoint[] = []
  const index = new Map<string, number>()

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    index.set(key, buckets.length)
    buckets.push({ month: key, count: 0 })
  }

  for (const iso of isoDates) {
    if (!iso) continue
    const slot = index.get(monthKey(iso))
    if (slot !== undefined) buckets[slot].count += 1
  }

  return buckets
}

// Month-over-month growth percentage between the last two buckets. Returns null
// when there is no prior month to compare against (avoids divide-by-zero).
export function growthRate(points: MonthlyPoint[]): number | null {
  if (points.length < 2) return null
  const prev = points[points.length - 2].count
  const curr = points[points.length - 1].count
  if (prev === 0) return curr === 0 ? 0 : null
  return Math.round(((curr - prev) / prev) * 100)
}
