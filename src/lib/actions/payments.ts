'use server'

// Phase 4C/4D — payment + invoice actions.
//
// No real payment provider is contacted (no API keys, no network calls). A
// clinic "initiates" a payment by recording an attempt + a pending payment with
// a generated reference; a platform admin then confirms or fails it manually.
// This is the safe stand-in until real Wave / Orange Money webhooks are wired.
//
// Billing tables are super_admin-write under RLS, and clinic_admins must be able
// to initiate their own payments, so mutations go through the service-role
// client with explicit in-action tenant checks (same pattern as F8).

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireCurrentUser, requireSuperAdmin } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import {
  isPaymentMethod,
  invoiceIsPayable,
  generateInvoiceNumber,
  addDaysISO,
  CLINIC_PAYMENT_METHODS,
  type PaymentMethod,
} from '@/lib/billing/payments'

export type FormState = { error: string | null }
export type PaymentState = { error: string | null; providerRef?: string; method?: PaymentMethod }

const RENEWAL_DAYS = 30
const GRACE_DAYS = 7

function providerRef(method: PaymentMethod): string {
  return `${method}-${randomBytes(6).toString('hex')}`
}

// ── Issue an invoice (super_admin; 4E will automate this) ──────────────────────

export async function issueInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSuperAdmin()
  const clinicId = ((formData.get('clinic_id') as string) ?? '').trim()
  if (!clinicId) return { error: 'Identifiant de clinique manquant.' }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: sub } = await db
    .from('subscriptions')
    .select('id, plan_id, current_period_end')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!sub) return { error: 'Cette clinique n’a pas d’abonnement.' }

  const { data: plan } = await db
    .from('plans')
    .select('price_xof')
    .eq('id', sub.plan_id as string)
    .maybeSingle()
  const amount = Number(plan?.price_xof ?? 0)
  if (amount <= 0) return { error: 'Le forfait de cette clinique n’a pas de montant facturable.' }

  const monthPrefix = now.slice(0, 7)
  const { count } = await db
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .gte('issued_at', `${monthPrefix}-01T00:00:00.000Z`)
  const number = generateInvoiceNumber((count ?? 0) + 1, now)

  const periodStart = (sub.current_period_end as string | null) ?? now
  const { data: inserted, error } = await db
    .from('invoices')
    .insert({
      clinic_id: clinicId,
      subscription_id: sub.id as string,
      number,
      amount_xof: amount,
      currency: 'XOF',
      status: 'open',
      period_start: periodStart,
      period_end: addDaysISO(periodStart, RENEWAL_DAYS),
      due_date: addDaysISO(now, GRACE_DAYS),
      issued_at: now,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await logAudit({
    userId: admin.id, clinicId,
    action: 'invoice.issued', entityType: 'invoice', entityId: inserted.id as string,
    metadata: { number, amountXof: amount },
  })

  revalidatePath(`/admin/clinics/${clinicId}`)
  revalidatePath('/admin/billing')
  return { error: null }
}

// ── Initiate a payment (clinic_admin or super_admin) ───────────────────────────

export async function initiatePayment(_prev: PaymentState, formData: FormData): Promise<PaymentState> {
  const user = await requireCurrentUser()
  if (!['clinic_admin', 'super_admin'].includes(user.role)) {
    return { error: 'Vous n’êtes pas autorisé à effectuer un paiement.' }
  }

  const invoiceId = ((formData.get('invoice_id') as string) ?? '').trim()
  const method = ((formData.get('method') as string) ?? '').trim()
  if (!invoiceId) return { error: 'Facture introuvable.' }
  if (!isPaymentMethod(method) || !CLINIC_PAYMENT_METHODS.includes(method)) {
    return { error: 'Méthode de paiement invalide.' }
  }

  const db = createAdminClient()
  const { data: invoice } = await db
    .from('invoices')
    .select('id, clinic_id, amount_xof, status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!invoice) return { error: 'Facture introuvable.' }

  // Tenant isolation: a clinic_admin may only pay their own clinic's invoices.
  if (user.role !== 'super_admin' && invoice.clinic_id !== user.clinicId) {
    return { error: 'Cette facture n’appartient pas à votre clinique.' }
  }
  if (!invoiceIsPayable(invoice.status as string)) {
    return { error: 'Cette facture n’est plus payable.' }
  }

  const ref = providerRef(method)
  const clinicId = invoice.clinic_id as string

  const { error: attemptError } = await db.from('payment_attempts').insert({
    clinic_id: clinicId,
    invoice_id: invoiceId,
    method,
    status: 'pending',
    provider_ref: ref,
  })
  if (attemptError) return { error: attemptError.message }

  await db.from('payments').insert({
    clinic_id: clinicId,
    invoice_id: invoiceId,
    amount_xof: invoice.amount_xof as number,
    currency: 'XOF',
    method,
    status: 'pending',
    provider_ref: ref,
  })

  await logAudit({
    userId: user.id, clinicId,
    action: 'payment.initiated', entityType: 'invoice', entityId: invoiceId,
    metadata: { method, providerRef: ref },
  })

  revalidatePath('/settings/billing')
  revalidatePath(`/admin/clinics/${clinicId}`)
  return { error: null, providerRef: ref, method }
}

// ── Reconcile a payment (super_admin; manual stand-in for provider webhook) ─────

export async function confirmPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSuperAdmin()
  const paymentId = ((formData.get('payment_id') as string) ?? '').trim()
  if (!paymentId) return { error: 'Paiement introuvable.' }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: payment } = await db
    .from('payments')
    .select('id, clinic_id, invoice_id')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment) return { error: 'Paiement introuvable.' }
  const clinicId = payment.clinic_id as string
  const invoiceId = payment.invoice_id as string | null

  await db.from('payments').update({ status: 'succeeded', paid_at: now }).eq('id', paymentId)
  if (invoiceId) {
    await db.from('invoices').update({ status: 'paid', paid_at: now }).eq('id', invoiceId)
    await db.from('payment_attempts').update({ status: 'succeeded' }).eq('invoice_id', invoiceId).eq('status', 'pending')
  }

  // A successful payment reactivates and renews the subscription.
  await db
    .from('subscriptions')
    .update({
      status: 'active',
      grace_ends_at: null,
      current_period_start: now,
      current_period_end: addDaysISO(now, RENEWAL_DAYS),
    })
    .eq('clinic_id', clinicId)
  await db.from('clinics').update({ status: 'active' }).eq('id', clinicId)

  await logAudit({
    userId: admin.id, clinicId,
    action: 'payment.confirmed', entityType: 'payment', entityId: paymentId,
  })

  revalidatePath(`/admin/clinics/${clinicId}`)
  revalidatePath('/admin/billing')
  return { error: null }
}

export async function failPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSuperAdmin()
  const paymentId = ((formData.get('payment_id') as string) ?? '').trim()
  const reason = ((formData.get('reason') as string) ?? '').trim() || null
  if (!paymentId) return { error: 'Paiement introuvable.' }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: payment } = await db
    .from('payments')
    .select('id, clinic_id, invoice_id')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment) return { error: 'Paiement introuvable.' }
  const clinicId = payment.clinic_id as string
  const invoiceId = payment.invoice_id as string | null

  await db.from('payments').update({ status: 'failed' }).eq('id', paymentId)
  if (invoiceId) {
    await db.from('payment_attempts').update({ status: 'failed', failure_reason: reason }).eq('invoice_id', invoiceId).eq('status', 'pending')
  }

  // A failed payment pushes an active/trial subscription into a grace window
  // before suspension (Trial/Active → Grace lifecycle step).
  const { data: sub } = await db
    .from('subscriptions')
    .select('status')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (sub && (sub.status === 'active' || sub.status === 'trial')) {
    await db
      .from('subscriptions')
      .update({ status: 'grace', grace_ends_at: addDaysISO(now, GRACE_DAYS) })
      .eq('clinic_id', clinicId)
  }

  await logAudit({
    userId: admin.id, clinicId,
    action: 'payment.failed', entityType: 'payment', entityId: paymentId,
    metadata: { reason },
  })

  revalidatePath(`/admin/clinics/${clinicId}`)
  revalidatePath('/admin/billing')
  return { error: null }
}
