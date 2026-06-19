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
import {
  applyPaymentSuccess,
  applyPaymentFailure,
  GRACE_DAYS,
  type PaymentRow,
} from '@/lib/billing/payment-transitions'
import { buildCheckoutUrl } from '@/lib/billing/payment-webhook'
import { classifyPlanChange, isPlanChangeTarget } from '@/lib/billing/tenant-admin'
import { purposeForPlanChange, upgradeChargeXof } from '@/lib/billing/payment-intent'
import type { PlanId } from '@/lib/billing/subscription'

export type FormState = { error: string | null }
export type PaymentState = {
  error: string | null
  providerRef?: string
  method?: PaymentMethod
  /** Hosted-checkout URL for mobile-money methods (Wave / Orange Money). */
  checkoutUrl?: string
}

const RENEWAL_DAYS = 30

function providerRef(method: PaymentMethod): string {
  return `${method}-${randomBytes(6).toString('hex')}`
}

// Per-provider hosted-checkout base. Stand-in default until real provider
// onboarding supplies the production base URL. Returns '' for non-mobile methods.
function checkoutBase(method: PaymentMethod): string {
  if (method === 'wave') return process.env.WAVE_CHECKOUT_BASE ?? 'https://pay.wave.example/checkout'
  if (method === 'orange_money') return process.env.ORANGE_MONEY_CHECKOUT_BASE ?? 'https://pay.orange.example/checkout'
  return ''
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

  // For mobile-money methods the clinic is redirected to the provider's hosted
  // checkout; the provider then confirms the payment via our webhook. Card/manual
  // have no hosted page (they stay pending for manual reconciliation).
  const base = checkoutBase(method)
  const checkoutUrl = base ? buildCheckoutUrl(base, ref) : undefined

  revalidatePath('/settings/billing')
  revalidatePath(`/admin/clinics/${clinicId}`)
  return { error: null, providerRef: ref, method, checkoutUrl }
}

// ── Initiate a plan upgrade (clinic_admin or super_admin) ──────────────────────
//
// Upgrade = pay the new plan's price now via Wave / Orange Money; on webhook (or
// manual) confirmation the subscription switches to the target plan and renews a
// full period. Creates the upgrade invoice + payment in one step.

export async function initiateUpgrade(_prev: PaymentState, formData: FormData): Promise<PaymentState> {
  const user = await requireCurrentUser()
  if (!['clinic_admin', 'super_admin'].includes(user.role)) {
    return { error: 'Vous n’êtes pas autorisé à modifier l’abonnement.' }
  }
  const clinicId = user.clinicId
  if (!clinicId) return { error: 'Aucune clinique associée à votre compte.' }

  const targetPlan = ((formData.get('target_plan') as string) ?? '').trim()
  const method = ((formData.get('method') as string) ?? '').trim()
  if (!isPlanChangeTarget(targetPlan)) return { error: 'Forfait cible invalide.' }
  if (!isPaymentMethod(method) || !CLINIC_PAYMENT_METHODS.includes(method)) {
    return { error: 'Méthode de paiement invalide.' }
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: sub } = await db
    .from('subscriptions')
    .select('id, plan_id')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!sub) return { error: 'Aucun abonnement à mettre à niveau.' }

  const fromPlan = ((sub.plan_id as string) ?? 'starter') as PlanId
  const kind = classifyPlanChange(fromPlan, targetPlan)
  if (purposeForPlanChange(kind) !== 'upgrade') {
    return { error: 'Ce forfait n’est pas une mise à niveau de votre forfait actuel.' }
  }

  const { data: plan } = await db
    .from('plans')
    .select('price_xof')
    .eq('id', targetPlan)
    .maybeSingle()
  const amount = upgradeChargeXof(Number(plan?.price_xof ?? 0))
  if (amount <= 0) {
    return { error: 'Ce forfait nécessite un devis. Contactez l’équipe Radiora.' }
  }

  // Create the upgrade invoice.
  const monthPrefix = now.slice(0, 7)
  const { count } = await db
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .gte('issued_at', `${monthPrefix}-01T00:00:00.000Z`)
  const number = generateInvoiceNumber((count ?? 0) + 1, now)

  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .insert({
      clinic_id: clinicId,
      subscription_id: sub.id as string,
      number,
      amount_xof: amount,
      currency: 'XOF',
      status: 'open',
      period_start: now,
      period_end: addDaysISO(now, RENEWAL_DAYS),
      due_date: addDaysISO(now, GRACE_DAYS),
      issued_at: now,
    })
    .select('id')
    .single()
  if (invoiceError) return { error: invoiceError.message }
  const invoiceId = invoice.id as string

  const ref = providerRef(method)
  const { error: attemptError } = await db.from('payment_attempts').insert({
    clinic_id: clinicId,
    invoice_id: invoiceId,
    method,
    status: 'pending',
    provider_ref: ref,
    purpose: 'upgrade',
  })
  if (attemptError) return { error: attemptError.message }

  await db.from('payments').insert({
    clinic_id: clinicId,
    invoice_id: invoiceId,
    amount_xof: amount,
    currency: 'XOF',
    method,
    status: 'pending',
    provider_ref: ref,
    purpose: 'upgrade',
    target_plan_id: targetPlan,
  })

  await logAudit({
    userId: user.id, clinicId,
    action: 'subscription.upgrade_initiated', entityType: 'subscription', entityId: sub.id as string,
    metadata: { fromPlan, targetPlan, method, amountXof: amount, providerRef: ref },
  })

  const base = checkoutBase(method)
  const checkoutUrl = base ? buildCheckoutUrl(base, ref) : undefined

  revalidatePath('/settings/billing')
  revalidatePath(`/admin/clinics/${clinicId}`)
  return { error: null, providerRef: ref, method, checkoutUrl }
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
    .select('id, clinic_id, invoice_id, amount_xof, purpose, target_plan_id')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment) return { error: 'Paiement introuvable.' }
  const clinicId = payment.clinic_id as string

  // Same transition the provider webhook applies — kept in one place.
  await applyPaymentSuccess(db, payment as PaymentRow, now)

  await logAudit({
    userId: admin.id, clinicId,
    action: 'payment.confirmed', entityType: 'payment', entityId: paymentId,
    metadata: { via: 'manual' },
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

  // Same transition the provider webhook applies — kept in one place.
  await applyPaymentFailure(db, payment as PaymentRow, reason, now)

  await logAudit({
    userId: admin.id, clinicId,
    action: 'payment.failed', entityType: 'payment', entityId: paymentId,
    metadata: { reason, via: 'manual' },
  })

  revalidatePath(`/admin/clinics/${clinicId}`)
  revalidatePath('/admin/billing')
  return { error: null }
}
