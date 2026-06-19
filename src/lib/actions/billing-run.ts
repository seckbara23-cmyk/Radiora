'use server'

// Phase 4E — automated billing cycle runner.
//
// A platform admin triggers this (no scheduler in this environment); it can also
// be invoked by a cron/service-role job later since every mutation uses the
// service-role client. It reads all subscriptions, asks the pure planner what to
// do, then materialises the result: milestone reminders land in the
// notifications outbox (Phase 4F delivers them), renewal invoices are issued,
// and the lifecycle advances (active/trial → grace → suspended).
//
// No real provider or messaging API is contacted here.

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import {
  planBillingRun,
  summarizeActions,
  type BillingSubscription,
  type BillingRunSummary,
  type ReminderType,
} from '@/lib/billing/billing-run'
import { generateInvoiceNumber, addDaysISO } from '@/lib/billing/payments'

export type BillingRunState = { error: string | null; summary?: BillingRunSummary }

interface SubRow {
  id: string
  clinic_id: string
  status: BillingSubscription['status']
  plan_id: BillingSubscription['planId']
  trial_ends_at: string | null
  current_period_end: string | null
  grace_ends_at: string | null
}

// French reminder copy (default platform language). The notification keeps its
// `type` + `reminder_day` too, so any channel can re-localise if needed.
function reminderText(type: ReminderType, day: number): { title: string; body: string } {
  const when = day === 0 ? "aujourd'hui" : `dans ${day} jour(s)`
  if (type === 'trial_ending') {
    return { title: 'Fin de votre essai gratuit', body: `Votre essai gratuit se termine ${when}. Choisissez un forfait pour continuer.` }
  }
  if (type === 'renewal_reminder') {
    return { title: 'Renouvellement de votre abonnement', body: `Votre abonnement se renouvelle ${when}. Assurez-vous que votre paiement est à jour.` }
  }
  return { title: 'Paiement en attente', body: `Votre accès sera suspendu ${when} faute de paiement. Régularisez votre situation.` }
}

export async function runBillingCycle(
  _prev: BillingRunState,
  _formData: FormData,
): Promise<BillingRunState> {
  const admin = await requireSuperAdmin()
  const db = createAdminClient()
  const now = new Date().toISOString()
  const monthPrefix = now.slice(0, 7)

  const [subsRes, plansRes, openInvRes, remindersRes, monthCountRes] = await Promise.all([
    db.from('subscriptions').select('id, clinic_id, status, plan_id, trial_ends_at, current_period_end, grace_ends_at'),
    db.from('plans').select('id, price_xof'),
    db.from('invoices').select('subscription_id').in('status', ['open', 'draft']),
    db.from('notifications').select('subscription_id, type, reminder_day').not('reminder_day', 'is', null),
    db.from('invoices').select('id', { count: 'exact', head: true }).gte('issued_at', `${monthPrefix}-01T00:00:00.000Z`),
  ])

  const subs: BillingSubscription[] = ((subsRes.data as SubRow[] | null) ?? []).map((s) => ({
    id: s.id,
    clinicId: s.clinic_id,
    status: s.status,
    planId: s.plan_id,
    trialEndsAt: s.trial_ends_at,
    currentPeriodEnd: s.current_period_end,
    graceEndsAt: s.grace_ends_at,
  }))

  const priceByPlan: Record<string, number> = {}
  for (const p of (plansRes.data as { id: string; price_xof: number }[] | null) ?? []) {
    priceByPlan[p.id] = Number(p.price_xof ?? 0)
  }

  const hasOpenInvoice = new Set<string>()
  for (const r of (openInvRes.data as { subscription_id: string | null }[] | null) ?? []) {
    if (r.subscription_id) hasOpenInvoice.add(r.subscription_id)
  }

  const existingReminders = new Set<string>()
  for (const r of (remindersRes.data as { subscription_id: string | null; type: string; reminder_day: number | null }[] | null) ?? []) {
    if (r.subscription_id && r.reminder_day !== null) {
      existingReminders.add(`${r.subscription_id}:${r.type}:${r.reminder_day}`)
    }
  }

  const actions = planBillingRun(subs, { nowISO: now, priceByPlan, existingReminders, hasOpenInvoice })

  let invoiceSeq = (monthCountRes.count ?? 0)

  for (const action of actions) {
    if (action.kind === 'reminder') {
      const { title, body } = reminderText(action.type, action.day)
      // Unique index backstops the planner dedup; ignore duplicate-key races.
      await db.from('notifications').insert({
        clinic_id: action.clinicId,
        subscription_id: action.subscriptionId,
        type: action.type,
        channel: 'in_app',
        status: 'pending',
        reminder_day: action.day,
        title,
        body,
        payload: { endsAt: action.endsAt },
      })
    } else if (action.kind === 'issue_invoice') {
      invoiceSeq += 1
      const number = generateInvoiceNumber(invoiceSeq, now)
      await db.from('invoices').insert({
        clinic_id: action.clinicId,
        subscription_id: action.subscriptionId,
        number,
        amount_xof: action.amountXof,
        currency: 'XOF',
        status: 'open',
        period_start: action.periodStart,
        period_end: action.periodEnd,
        due_date: addDaysISO(now, 7),
        issued_at: now,
      })
      await db.from('notifications').insert({
        clinic_id: action.clinicId,
        subscription_id: action.subscriptionId,
        type: 'invoice_issued',
        channel: 'in_app',
        status: 'pending',
        title: 'Nouvelle facture',
        body: `Une facture de ${action.amountXof} FCFA a été émise pour votre abonnement.`,
        payload: { number, amountXof: action.amountXof },
      })
    } else if (action.kind === 'transition' && action.to === 'grace') {
      await db.from('subscriptions').update({ status: 'grace', grace_ends_at: action.graceEndsAt }).eq('id', action.subscriptionId)
    } else if (action.kind === 'transition' && action.to === 'suspended') {
      await db.from('subscriptions').update({ status: 'suspended' }).eq('id', action.subscriptionId)
      await db.from('clinics').update({ status: 'suspended' }).eq('id', action.clinicId)
      await db.from('notifications').insert({
        clinic_id: action.clinicId,
        subscription_id: action.subscriptionId,
        type: 'suspended',
        channel: 'in_app',
        status: 'pending',
        title: 'Abonnement suspendu',
        body: 'Votre abonnement a été suspendu faute de paiement. Vos comptes rendus restent consultables.',
      })
    }
  }

  const summary = summarizeActions(actions)
  await logAudit({
    userId: admin.id, clinicId: null,
    action: 'billing.cycle_run', entityType: 'platform', entityId: 'billing',
    metadata: { ...summary },
  })

  revalidatePath('/admin/billing')
  return { error: null, summary }
}
