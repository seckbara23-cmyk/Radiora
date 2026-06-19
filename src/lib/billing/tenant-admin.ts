// Phase 5A — pure helpers for Super Admin tenant lifecycle management.
//
// Deterministic, IO-free, unit-tested. The server actions in
// src/lib/actions/platform.ts apply these decisions against the database; the
// rules themselves (is this a plan upgrade or downgrade? what's the new trial
// end date?) live here so they can be tested without a database.

import { PLAN_IDS, type PlanId } from '@/lib/billing/subscription'

// Plans ordered from least to most capable. Index = rank.
export const PLAN_RANK: Record<PlanId, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
}

export type PlanChangeKind = 'upgrade' | 'downgrade' | 'unchanged'

/** Classify a plan change relative to the clinic's current plan. */
export function classifyPlanChange(from: PlanId, to: PlanId): PlanChangeKind {
  if (PLAN_RANK[to] > PLAN_RANK[from]) return 'upgrade'
  if (PLAN_RANK[to] < PLAN_RANK[from]) return 'downgrade'
  return 'unchanged'
}

export function isPlanChangeTarget(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value)
}

const MIN_TRIAL_EXTENSION_DAYS = 1
const MAX_TRIAL_EXTENSION_DAYS = 90

/** Clamp an admin-supplied trial-extension length to a sane range. */
export function clampTrialExtensionDays(raw: number): number {
  if (!Number.isFinite(raw)) return MIN_TRIAL_EXTENSION_DAYS
  const n = Math.floor(raw)
  if (n < MIN_TRIAL_EXTENSION_DAYS) return MIN_TRIAL_EXTENSION_DAYS
  if (n > MAX_TRIAL_EXTENSION_DAYS) return MAX_TRIAL_EXTENSION_DAYS
  return n
}

/**
 * New trial-end date when extending a trial by `days`. The extension is added to
 * whichever is later — the existing trial end or now — so extending an
 * already-lapsed trial gives a full fresh window rather than a date in the past.
 */
export function extendTrialEnd(
  currentTrialEnd: string | null,
  days: number,
  nowISO: string,
): string {
  const clamped = clampTrialExtensionDays(days)
  const now = new Date(nowISO).getTime()
  const existing = currentTrialEnd ? new Date(currentTrialEnd).getTime() : NaN
  const base = Number.isFinite(existing) && existing > now ? existing : now
  return new Date(base + clamped * 86_400_000).toISOString()
}
