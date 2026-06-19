// Phase 5J — pure aggregation for the Customer Success view of the Super Admin
// portal. Deterministic and IO-free: callers pass already-fetched subscription /
// usage METADATA plus an explicit `nowISO`, so every function is unit-testable
// and never touches clinical content. The goal these power is converting trial
// clinics into paying subscribers.

import { daysUntil, type SubscriptionStatus } from '@/lib/billing/subscription'

// ── Whole days since a past timestamp (0 today, positive in the past) ──────────
export function daysSince(iso: string | null | undefined, nowISO: string): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  const now = new Date(nowISO).getTime()
  if (Number.isNaN(then) || Number.isNaN(now)) return null
  return Math.floor((now - then) / 86_400_000)
}

// ── Trial → paid conversion funnel ─────────────────────────────────────────────
export interface ConversionFunnel {
  totalClinics: number
  withSubscription: number
  trialing: number // currently in trial
  paying: number // active or grace (recurring revenue)
  churned: number // suspended or cancelled
  // Of the clinics that reached a decision point (paying or churned), the share
  // that converted to paying. Trials still in progress are excluded so the rate
  // reflects resolved outcomes only. 0 when nobody has resolved yet.
  conversionRate: number
}

export function conversionFunnel(
  rows: { status: SubscriptionStatus | null }[],
  totalClinics: number,
): ConversionFunnel {
  let withSubscription = 0
  let trialing = 0
  let paying = 0
  let churned = 0

  for (const r of rows) {
    if (!r.status) continue
    withSubscription += 1
    if (r.status === 'trial') trialing += 1
    else if (r.status === 'active' || r.status === 'grace') paying += 1
    else if (r.status === 'suspended' || r.status === 'cancelled') churned += 1
  }

  const resolved = paying + churned
  const conversionRate = resolved === 0 ? 0 : Math.round((paying / resolved) * 100)

  return { totalClinics, withSubscription, trialing, paying, churned, conversionRate }
}

// ── Engagement health from last-login recency ──────────────────────────────────
export type EngagementLevel = 'new' | 'active' | 'at_risk' | 'dormant'

export interface EngagementThresholds {
  newClinicDays: number // a clinic this young with no login yet is still "new"
  activeDays: number // logged in within this window → active
  atRiskDays: number // logged in within this window → at risk; beyond → dormant
}

export const DEFAULT_ENGAGEMENT: EngagementThresholds = {
  newClinicDays: 7,
  activeDays: 7,
  atRiskDays: 21,
}

// Classify a clinic by how recently someone logged in, relative to nowISO.
// A brand-new clinic that has not logged in yet is "new" (not dormant) so it
// surfaces for onboarding outreach rather than churn outreach.
export function classifyEngagement(
  lastLoginISO: string | null | undefined,
  createdAtISO: string,
  nowISO: string,
  thresholds: EngagementThresholds = DEFAULT_ENGAGEMENT,
): EngagementLevel {
  const sinceLogin = daysSince(lastLoginISO, nowISO)

  if (sinceLogin === null) {
    const age = daysSince(createdAtISO, nowISO)
    if (age !== null && age <= thresholds.newClinicDays) return 'new'
    return 'dormant'
  }

  if (sinceLogin <= thresholds.activeDays) return 'active'
  if (sinceLogin <= thresholds.atRiskDays) return 'at_risk'
  return 'dormant'
}

export type EngagementCounts = Record<EngagementLevel, number>

export function summariseEngagement(
  clinics: { lastLoginISO: string | null; createdAtISO: string }[],
  nowISO: string,
  thresholds: EngagementThresholds = DEFAULT_ENGAGEMENT,
): EngagementCounts {
  const counts: EngagementCounts = { new: 0, active: 0, at_risk: 0, dormant: 0 }
  for (const c of clinics) {
    counts[classifyEngagement(c.lastLoginISO, c.createdAtISO, nowISO, thresholds)] += 1
  }
  return counts
}

// ── Trial urgency: how close a trial is to expiring (drives outreach order) ─────
export type TrialUrgency = 'expired' | 'critical' | 'upcoming' | 'comfortable'

// `critical` ≤ 3 days left, `upcoming` ≤ 14, else `comfortable`; already past → `expired`.
export function trialUrgency(trialEndsAtISO: string | null | undefined, nowISO: string): TrialUrgency | null {
  const left = daysUntil(trialEndsAtISO, nowISO)
  if (left === null) return null
  if (left < 0) return 'expired'
  if (left <= 3) return 'critical'
  if (left <= 14) return 'upcoming'
  return 'comfortable'
}
