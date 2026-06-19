// Phase 5C — shared payment state transitions.
//
// These functions own the side effects of a payment resolving one way or the
// other, so the manual reconcile actions (super_admin) and the provider webhook
// (Wave / Orange Money) apply EXACTLY the same lifecycle changes. They run with
// the service-role admin client and never touch auth/session state.
//
// server-only (no 'use server'): plain async helpers, not server actions.
import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { addDaysISO } from '@/lib/billing/payments'

type AdminClient = ReturnType<typeof createAdminClient>

export const RENEWAL_DAYS = 30
export const GRACE_DAYS = 7

export type PaymentRow = { id: string; clinic_id: string; invoice_id: string | null; status?: string }

// A payment succeeded: mark it paid, settle its invoice + attempt, then reactivate
// and renew the subscription (Grace/Suspended → Active). Idempotent — re-running on
// an already-succeeded payment produces the same end state.
export async function applyPaymentSuccess(db: AdminClient, payment: PaymentRow, nowISO: string): Promise<void> {
  const { id, clinic_id: clinicId, invoice_id: invoiceId } = payment

  await db.from('payments').update({ status: 'succeeded', paid_at: nowISO }).eq('id', id)
  if (invoiceId) {
    await db.from('invoices').update({ status: 'paid', paid_at: nowISO }).eq('id', invoiceId)
    await db
      .from('payment_attempts')
      .update({ status: 'succeeded' })
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
  }

  await db
    .from('subscriptions')
    .update({
      status: 'active',
      grace_ends_at: null,
      current_period_start: nowISO,
      current_period_end: addDaysISO(nowISO, RENEWAL_DAYS),
    })
    .eq('clinic_id', clinicId)
  await db.from('clinics').update({ status: 'active' }).eq('id', clinicId)
}

// A payment failed (declined / cancelled / timed out): mark it failed, fail its
// pending attempt, and push an active/trial subscription into a grace window
// before suspension. Idempotent for the payment row; the grace step only fires
// while the subscription is still active/trial.
export async function applyPaymentFailure(
  db: AdminClient,
  payment: PaymentRow,
  reason: string | null,
  nowISO: string,
): Promise<void> {
  const { id, clinic_id: clinicId, invoice_id: invoiceId } = payment

  await db.from('payments').update({ status: 'failed' }).eq('id', id)
  if (invoiceId) {
    await db
      .from('payment_attempts')
      .update({ status: 'failed', failure_reason: reason })
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
  }

  const { data: sub } = await db
    .from('subscriptions')
    .select('status')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (sub && (sub.status === 'active' || sub.status === 'trial')) {
    await db
      .from('subscriptions')
      .update({ status: 'grace', grace_ends_at: addDaysISO(nowISO, GRACE_DAYS) })
      .eq('clinic_id', clinicId)
  }
}
