// Phase 4A — pure subscription-lifecycle logic for the Radiora SaaS platform.
//
// Deterministic, IO-free, unit-tested. Encodes:
//   * the subscription lifecycle: trial → active → grace → suspended → cancelled;
//   * what "effective access" a clinic has right now (can it create clinical
//     content, or is it read-only?);
//   * per-plan user limits.
//
// Business rule (verbatim from the Phase 4 spec) when a subscription lapses:
// login remains possible, reports stay accessible, BUT medical workflows become
// read-only and new reports cannot be created.

export type PlanId = 'starter' | 'professional' | 'enterprise'
export const PLAN_IDS: PlanId[] = ['starter', 'professional', 'enterprise']

// The stored lifecycle status of a subscription.
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'suspended' | 'cancelled'
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'trial',
  'active',
  'grace',
  'suspended',
  'cancelled',
]

// The EFFECTIVE state once dates are taken into account (a 'trial' row whose
// trial_ends_at has passed is effectively 'expired').
export type AccessState =
  | 'trialing'
  | 'active'
  | 'grace'
  | 'expired'
  | 'suspended'
  | 'cancelled'

export interface ClinicAccess {
  state: AccessState
  /** True when the clinic may create / modify clinical content. */
  canWrite: boolean
  /** Convenience inverse of canWrite. */
  readOnly: boolean
  /** Whole days until the trial or current period ends (null when N/A). */
  daysLeft: number | null
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value)
}

// Whole days from now until target (negative once target is in the past).
export function daysUntil(targetISO: string | null | undefined, nowISO: string): number | null {
  if (!targetISO) return null
  const target = new Date(targetISO).getTime()
  const now = new Date(nowISO).getTime()
  if (Number.isNaN(target) || Number.isNaN(now)) return null
  return Math.ceil((target - now) / 86_400_000)
}

function isPast(targetISO: string | null | undefined, nowISO: string): boolean {
  if (!targetISO) return false
  const target = new Date(targetISO).getTime()
  const now = new Date(nowISO).getTime()
  if (Number.isNaN(target) || Number.isNaN(now)) return false
  return now > target
}

export interface SubscriptionLike {
  status: SubscriptionStatus
  trialEndsAt?: string | null
  currentPeriodEnd?: string | null
  graceEndsAt?: string | null
}

// Resolve the effective access a clinic has right now.
export function computeAccess(sub: SubscriptionLike | null, nowISO: string): ClinicAccess {
  // No subscription on record → fail OPEN (do not lock out existing tenants
  // during incremental rollout). Billing jobs create rows going forward.
  if (!sub) {
    return { state: 'active', canWrite: true, readOnly: false, daysLeft: null }
  }

  let state: AccessState
  let daysLeft: number | null = null

  switch (sub.status) {
    case 'cancelled':
      state = 'cancelled'
      break
    case 'suspended':
      state = 'suspended'
      break
    case 'trial':
      if (isPast(sub.trialEndsAt, nowISO)) {
        state = 'expired'
      } else {
        state = 'trialing'
        daysLeft = daysUntil(sub.trialEndsAt, nowISO)
      }
      break
    case 'grace':
      if (isPast(sub.graceEndsAt, nowISO)) {
        state = 'suspended'
      } else {
        state = 'grace'
        daysLeft = daysUntil(sub.graceEndsAt, nowISO)
      }
      break
    case 'active':
    default:
      state = 'active'
      daysLeft = daysUntil(sub.currentPeriodEnd, nowISO)
      break
  }

  const canWrite = state === 'active' || state === 'trialing' || state === 'grace'
  return { state, canWrite, readOnly: !canWrite, daysLeft }
}

// Should the trial-ending / renewal banner be shown, and how urgent?
export function shouldWarnExpiry(access: ClinicAccess, thresholdDays = 7): boolean {
  if (access.state !== 'trialing' && access.state !== 'grace') return false
  return access.daysLeft !== null && access.daysLeft <= thresholdDays
}

// ─── Per-plan user limits ─────────────────────────────────────────────────────
// null = unlimited.
export interface PlanLimits {
  maxRadiologists: number | null
  maxSecretaries: number | null
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  starter: { maxRadiologists: 1, maxSecretaries: 2 },
  professional: { maxRadiologists: 10, maxSecretaries: null },
  enterprise: { maxRadiologists: null, maxSecretaries: null },
}

export function planLimits(planId: string): PlanLimits {
  return isPlanId(planId) ? PLAN_LIMITS[planId] : PLAN_LIMITS.starter
}

// Can a clinic on `planId` add one more user of the given kind given its current count?
export function withinUserLimit(
  planId: string,
  kind: 'radiologist' | 'secretary',
  currentCount: number,
): boolean {
  const limits = planLimits(planId)
  const max = kind === 'radiologist' ? limits.maxRadiologists : limits.maxSecretaries
  if (max === null) return true
  return currentCount < max
}
