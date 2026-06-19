// Phase 5D — payment purposes (shared by Wave and Orange Money).
//
// Every payment now records WHY it happened, so the same provider rails serve the
// three commercial flows the spec calls out for Orange Money (and Wave):
//   subscription — first paid period after a trial / a fresh subscription charge
//   renewal      — paying the recurring monthly invoice to extend the period
//   upgrade      — moving to a higher plan, charged at the new plan's price
//
// Pure + deterministic: no IO. Used by the payment actions, the webhook
// transitions and the UI.

import type { PlanChangeKind } from '@/lib/billing/tenant-admin'

export type PaymentPurpose = 'subscription' | 'renewal' | 'upgrade'

export const PAYMENT_PURPOSES: PaymentPurpose[] = ['subscription', 'renewal', 'upgrade']

export function isPaymentPurpose(value: string): value is PaymentPurpose {
  return (PAYMENT_PURPOSES as string[]).includes(value)
}

// Which purpose a plan change implies. Only upgrades are billable here; a
// downgrade or an unchanged plan never produces an upgrade payment.
export function purposeForPlanChange(kind: PlanChangeKind): PaymentPurpose | null {
  return kind === 'upgrade' ? 'upgrade' : null
}

// An upgrade starts a fresh period on the new plan, charged at that plan's full
// monthly price. Floored and clamped to a non-negative integer (XOF has no
// sub-unit). A non-positive price (e.g. Enterprise "on request") yields 0, which
// callers treat as "not self-purchasable — contact sales".
export function upgradeChargeXof(targetPriceXof: number): number {
  if (!Number.isFinite(targetPriceXof) || targetPriceXof <= 0) return 0
  return Math.floor(targetPriceXof)
}
