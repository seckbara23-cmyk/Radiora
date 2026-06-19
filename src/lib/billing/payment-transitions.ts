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
import { addDaysISO, generateReceiptNumber } from '@/lib/billing/payments'

type AdminClient = ReturnType<typeof createAdminClient>

export const RENEWAL_DAYS = 30
export const GRACE_DAYS = 7

export type PaymentRow = {
  id: string
  clinic_id: string
  invoice_id: string | null
  status?: string
  amount_xof?: number | null
  /** Phase 5D: why this payment was made. */
  purpose?: string | null
  /** Phase 5D: for an upgrade, the plan to switch to on success. */
  target_plan_id?: string | null
}

// A payment succeeded: mark it paid, settle its invoice + attempt, then reactivate
// and renew the subscription (Grace/Suspended → Active). For an upgrade payment the
// subscription's plan is switched to the target. Idempotent — re-running on an
// already-succeeded payment produces the same end state.
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

  // Base renewal: reactivate + extend the period by one cycle.
  const subUpdate: Record<string, unknown> = {
    status: 'active',
    grace_ends_at: null,
    current_period_start: nowISO,
    current_period_end: addDaysISO(nowISO, RENEWAL_DAYS),
  }
  // An upgrade payment also moves the subscription (and clinic) onto the new plan.
  const isUpgrade = payment.purpose === 'upgrade' && !!payment.target_plan_id
  if (isUpgrade) subUpdate.plan_id = payment.target_plan_id

  await db.from('subscriptions').update(subUpdate).eq('clinic_id', clinicId)

  const clinicUpdate: Record<string, unknown> = { status: 'active' }
  if (isUpgrade) clinicUpdate.plan = payment.target_plan_id
  await db.from('clinics').update(clinicUpdate).eq('id', clinicId)

  // Phase 5E: issue a receipt for the settled payment (idempotent — one per
  // payment, guarded by an existence check + a unique index).
  await issueReceipt(db, payment, nowISO)
}

// Create a receipt for a succeeded payment and notify the clinic. Receipts carry
// billing data only (no PHI). Best-effort: a failure here never unwinds the
// already-applied payment.
async function issueReceipt(db: AdminClient, payment: PaymentRow, nowISO: string): Promise<void> {
  if (!payment.invoice_id && payment.amount_xof == null) return
  try {
    const { data: existing } = await db
      .from('receipts')
      .select('id')
      .eq('payment_id', payment.id)
      .maybeSingle()
    if (existing) return

    const amount = Number(payment.amount_xof ?? 0)
    const monthPrefix = nowISO.slice(0, 7)
    const { count } = await db
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .gte('issued_at', `${monthPrefix}-01T00:00:00.000Z`)
    const number = generateReceiptNumber((count ?? 0) + 1, nowISO)

    await db.from('receipts').insert({
      clinic_id: payment.clinic_id,
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      number,
      amount_xof: amount,
      currency: 'XOF',
      issued_at: nowISO,
    })

    await db.from('notifications').insert({
      clinic_id: payment.clinic_id,
      type: 'receipt_issued',
      channel: 'in_app',
      status: 'pending',
      title: 'Reçu de paiement',
      body: `Votre reçu ${number} (${amount} FCFA) est disponible.`,
      payload: { number, amountXof: amount },
    })
  } catch {
    /* receipt issuance must never unwind a confirmed payment */
  }
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
