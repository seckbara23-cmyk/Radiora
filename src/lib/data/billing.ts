// Phase 4A — read access to the billing domain.
//
// Clinic-scoped reads go through the user-session client (RLS confines a
// clinic_admin to their own clinic; super_admin sees all). Platform-wide reads
// for the Super Admin Portal use the service-role client and are guarded by an
// explicit is_super_admin() check at the call site.

import { createClient } from '@/lib/supabase/server'
import type { PlanId, SubscriptionStatus } from '@/lib/billing/subscription'
import type { Plan, Subscription, Invoice, Payment } from '@/types/billing'

function mapPlan(row: Record<string, unknown>): Plan {
  const features = row.features
  return {
    id: row.id as PlanId,
    name: row.name as string,
    description: (row.description as string) ?? '',
    priceXof: Number(row.price_xof ?? 0),
    maxRadiologists: (row.max_radiologists as number | null) ?? null,
    maxSecretaries: (row.max_secretaries as number | null) ?? null,
    features: Array.isArray(features) ? (features as string[]) : [],
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active ?? true),
  }
}

function mapSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    planId: row.plan_id as PlanId,
    status: row.status as SubscriptionStatus,
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
    currentPeriodStart: (row.current_period_start as string | null) ?? null,
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    graceEndsAt: (row.grace_ends_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    subscriptionId: (row.subscription_id as string | null) ?? null,
    number: row.number as string,
    amountXof: Number(row.amount_xof ?? 0),
    currency: (row.currency as string) ?? 'XOF',
    status: row.status as Invoice['status'],
    periodStart: (row.period_start as string | null) ?? null,
    periodEnd: (row.period_end as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    issuedAt: row.issued_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
  }
}

function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    invoiceId: (row.invoice_id as string | null) ?? null,
    amountXof: Number(row.amount_xof ?? 0),
    currency: (row.currency as string) ?? 'XOF',
    method: row.method as Payment['method'],
    status: row.status as Payment['status'],
    providerRef: (row.provider_ref as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

const PLAN_COLS =
  'id, name, description, price_xof, max_radiologists, max_secretaries, features, sort_order, is_active'
const SUB_COLS =
  'id, clinic_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, grace_ends_at, cancelled_at, created_at, updated_at'
const INVOICE_COLS =
  'id, clinic_id, subscription_id, number, amount_xof, currency, status, period_start, period_end, due_date, issued_at, paid_at'

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(mapPlan)
}

// The current subscription for a clinic (one per clinic). RLS confines visibility.
export async function getClinicSubscription(clinicId: string): Promise<Subscription | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select(SUB_COLS)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (error || !data) return null
  return mapSubscription(data as unknown as Record<string, unknown>)
}

export async function getClinicInvoices(clinicId: string): Promise<Invoice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_COLS)
    .eq('clinic_id', clinicId)
    .order('issued_at', { ascending: false })
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(mapInvoice)
}

const PAYMENT_COLS =
  'id, clinic_id, invoice_id, amount_xof, currency, method, status, provider_ref, paid_at, created_at'

export async function getClinicPayments(clinicId: string): Promise<Payment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLS)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(mapPayment)
}
