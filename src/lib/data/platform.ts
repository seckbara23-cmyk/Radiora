// Phase 4B — platform-wide reads for the Super Admin Portal.
//
// SECURITY: platform admins may see tenant, subscription, billing and USAGE
// data only — never clinical content. Every query in this module selects
// metadata columns exclusively (ids, status, timestamps, counts). It NEVER
// selects report findings/impressions, patient identifiers, audio, or any
// clinical document. Each function self-guards with requireSuperAdmin() in
// addition to the portal layout gate (defense in depth), then uses the
// service-role client to read across all tenants.
//
// Server-only.

import 'server-only'
import { requireSuperAdmin } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeAccess,
  type PlanId,
  type SubscriptionStatus,
  type ClinicAccess,
} from '@/lib/billing/subscription'
import {
  countByStatus,
  monthlyRecurringRevenue,
  expiringSoon,
  monthlyCounts,
  growthRate,
  type StatusCounts,
  type SubscriptionMetricRow,
  type MonthlyPoint,
} from '@/lib/billing/metrics'

export interface TenantSummary {
  id: string
  name: string
  slug: string
  city: string | null
  country: string | null
  status: string
  plan: string
  createdAt: string
  subscriptionStatus: SubscriptionStatus | null
  planId: PlanId | null
  access: ClinicAccess
  userCount: number
  radiologistCount: number
  reportCount: number
}

interface SubRow {
  clinic_id: string
  status: SubscriptionStatus
  plan_id: PlanId
  trial_ends_at: string | null
  grace_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
}

function tally(rows: { clinic_id: string }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.clinic_id, (m.get(r.clinic_id) ?? 0) + 1)
  return m
}

// ── Tenant management ─────────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantSummary[]> {
  await requireSuperAdmin()
  const db = createAdminClient()
  const now = new Date().toISOString()

  const [clinicsRes, subsRes, profilesRes, reportsRes] = await Promise.all([
    db.from('clinics').select('id, name, slug, city, country, status, plan, created_at').order('created_at', { ascending: false }),
    db.from('subscriptions').select('clinic_id, status, plan_id, trial_ends_at, grace_ends_at, current_period_start, current_period_end'),
    db.from('profiles').select('clinic_id, role'),
    db.from('reports').select('clinic_id'),
  ])

  const subsByClinic = new Map<string, SubRow>()
  for (const s of (subsRes.data as SubRow[] | null) ?? []) subsByClinic.set(s.clinic_id, s)

  const profiles = (profilesRes.data as { clinic_id: string | null; role: string }[] | null) ?? []
  const userCounts = tally(profiles.filter((p) => p.clinic_id) as { clinic_id: string }[])
  const radCounts = tally(
    profiles.filter((p) => p.clinic_id && p.role === 'radiologist') as { clinic_id: string }[],
  )
  const reportCounts = tally(((reportsRes.data as { clinic_id: string }[] | null) ?? []).filter((r) => r.clinic_id))

  return ((clinicsRes.data as Record<string, unknown>[] | null) ?? []).map((c) => {
    const id = c.id as string
    const sub = subsByClinic.get(id) ?? null
    return {
      id,
      name: c.name as string,
      slug: c.slug as string,
      city: (c.city as string | null) ?? null,
      country: (c.country as string | null) ?? null,
      status: c.status as string,
      plan: c.plan as string,
      createdAt: c.created_at as string,
      subscriptionStatus: sub?.status ?? null,
      planId: sub?.plan_id ?? null,
      access: computeAccess(
        sub
          ? {
              status: sub.status,
              trialEndsAt: sub.trial_ends_at,
              graceEndsAt: sub.grace_ends_at,
              currentPeriodEnd: sub.current_period_end,
            }
          : null,
        now,
      ),
      userCount: userCounts.get(id) ?? 0,
      radiologistCount: radCounts.get(id) ?? 0,
      reportCount: reportCounts.get(id) ?? 0,
    }
  })
}

export interface TenantDetail extends TenantSummary {
  email: string | null
  phone: string | null
  address: string | null
  technicianCount: number
  studyCount: number
  patientCount: number
  subscription: SubRow | null
}

export async function getTenantDetail(clinicId: string): Promise<TenantDetail | null> {
  await requireSuperAdmin()
  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: c } = await db
    .from('clinics')
    .select('id, name, slug, city, country, status, plan, created_at, email, phone, address')
    .eq('id', clinicId)
    .maybeSingle()
  if (!c) return null

  const [subRes, profilesRes, reportsRes, studiesRes, patientsRes] = await Promise.all([
    db.from('subscriptions').select('clinic_id, status, plan_id, trial_ends_at, grace_ends_at, current_period_start, current_period_end').eq('clinic_id', clinicId).maybeSingle(),
    db.from('profiles').select('role').eq('clinic_id', clinicId),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId),
    db.from('studies').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId),
    db.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId),
  ])

  const sub = (subRes.data as SubRow | null) ?? null
  const profiles = (profilesRes.data as { role: string }[] | null) ?? []
  const cc = c as Record<string, unknown>

  return {
    id: cc.id as string,
    name: cc.name as string,
    slug: cc.slug as string,
    city: (cc.city as string | null) ?? null,
    country: (cc.country as string | null) ?? null,
    status: cc.status as string,
    plan: cc.plan as string,
    createdAt: cc.created_at as string,
    email: (cc.email as string | null) ?? null,
    phone: (cc.phone as string | null) ?? null,
    address: (cc.address as string | null) ?? null,
    subscriptionStatus: sub?.status ?? null,
    planId: sub?.plan_id ?? null,
    access: computeAccess(
      sub
        ? { status: sub.status, trialEndsAt: sub.trial_ends_at, graceEndsAt: sub.grace_ends_at, currentPeriodEnd: sub.current_period_end }
        : null,
      now,
    ),
    userCount: profiles.length,
    radiologistCount: profiles.filter((p) => p.role === 'radiologist').length,
    technicianCount: profiles.filter((p) => p.role === 'technician' || p.role === 'secretary').length,
    reportCount: reportsRes.count ?? 0,
    studyCount: studiesRes.count ?? 0,
    patientCount: patientsRes.count ?? 0,
    subscription: sub,
  }
}

// ── Billing dashboard ─────────────────────────────────────────────────────────

export interface FailedPayment {
  clinicId: string
  clinicName: string
  method: string
  failureReason: string | null
  attemptedAt: string
}

export interface ExpiringTenant {
  clinicId: string
  clinicName: string
  status: SubscriptionStatus
  endsAt: string | null
}

export interface BillingOverview {
  statusCounts: StatusCounts
  mrrXof: number
  paidThisMonthXof: number
  expiring: ExpiringTenant[]
  failedPayments: FailedPayment[]
}

export async function getBillingOverview(): Promise<BillingOverview> {
  await requireSuperAdmin()
  const db = createAdminClient()
  const now = new Date().toISOString()
  const monthPrefix = now.slice(0, 7)

  const [subsRes, plansRes, clinicsRes, invoicesRes, attemptsRes] = await Promise.all([
    db.from('subscriptions').select('clinic_id, status, plan_id, trial_ends_at, grace_ends_at, current_period_start, current_period_end'),
    db.from('plans').select('id, price_xof'),
    db.from('clinics').select('id, name'),
    db.from('invoices').select('amount_xof, status, paid_at'),
    db.from('payment_attempts').select('clinic_id, method, status, failure_reason, created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(20),
  ])

  const subs = (subsRes.data as SubRow[] | null) ?? []
  const priceByPlan: Record<string, number> = {}
  for (const p of (plansRes.data as { id: string; price_xof: number }[] | null) ?? []) {
    priceByPlan[p.id] = Number(p.price_xof ?? 0)
  }
  const nameByClinic = new Map<string, string>()
  for (const c of (clinicsRes.data as { id: string; name: string }[] | null) ?? []) nameByClinic.set(c.id, c.name)

  // Keep the originating clinic row alongside each metric row so we can label
  // the "expiring soon" panel without re-joining by index.
  const metricRows: (SubscriptionMetricRow & { __sub: SubRow })[] = subs.map((s) => ({
    status: s.status,
    planId: s.plan_id,
    trialEndsAt: s.trial_ends_at,
    graceEndsAt: s.grace_ends_at,
    currentPeriodEnd: s.current_period_end,
    __sub: s,
  }))

  const paidThisMonthXof = ((invoicesRes.data as { amount_xof: number; status: string; paid_at: string | null }[] | null) ?? [])
    .filter((i) => i.status === 'paid' && i.paid_at && i.paid_at.startsWith(monthPrefix))
    .reduce((sum, i) => sum + Number(i.amount_xof ?? 0), 0)

  const expiring: ExpiringTenant[] = (expiringSoon(metricRows, now, 7) as (SubscriptionMetricRow & { __sub: SubRow })[]).map((row) => {
    const s = row.__sub
    return {
      clinicId: s.clinic_id,
      clinicName: nameByClinic.get(s.clinic_id) ?? s.clinic_id,
      status: s.status,
      endsAt: s.status === 'trial' ? s.trial_ends_at : s.status === 'grace' ? s.grace_ends_at : s.current_period_end,
    }
  })

  const failedPayments: FailedPayment[] = ((attemptsRes.data as { clinic_id: string; method: string; failure_reason: string | null; created_at: string }[] | null) ?? []).map((a) => ({
    clinicId: a.clinic_id,
    clinicName: nameByClinic.get(a.clinic_id) ?? a.clinic_id,
    method: a.method,
    failureReason: a.failure_reason,
    attemptedAt: a.created_at,
  }))

  return {
    statusCounts: countByStatus(metricRows),
    mrrXof: monthlyRecurringRevenue(metricRows, priceByPlan),
    paidThisMonthXof,
    expiring,
    failedPayments,
  }
}

// ── Platform analytics ────────────────────────────────────────────────────────

export interface PlatformAnalytics {
  totals: {
    clinics: number
    radiologists: number
    reports: number
    dictations: number
  }
  clinicGrowth: MonthlyPoint[]
  reportGrowth: MonthlyPoint[]
  clinicGrowthRate: number | null
  reportGrowthRate: number | null
}

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  await requireSuperAdmin()
  const db = createAdminClient()
  const now = new Date().toISOString()

  const [clinicsCnt, radCnt, reportsCnt, dictCnt, clinicDates, reportDates] = await Promise.all([
    db.from('clinics').select('id', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'radiologist'),
    db.from('reports').select('id', { count: 'exact', head: true }),
    db.from('voice_transcripts').select('id', { count: 'exact', head: true }),
    db.from('clinics').select('created_at'),
    db.from('reports').select('created_at'),
  ])

  const clinicGrowth = monthlyCounts(
    ((clinicDates.data as { created_at: string }[] | null) ?? []).map((r) => r.created_at),
    now,
    6,
  )
  const reportGrowth = monthlyCounts(
    ((reportDates.data as { created_at: string }[] | null) ?? []).map((r) => r.created_at),
    now,
    6,
  )

  return {
    totals: {
      clinics: clinicsCnt.count ?? 0,
      radiologists: radCnt.count ?? 0,
      reports: reportsCnt.count ?? 0,
      dictations: dictCnt.count ?? 0,
    },
    clinicGrowth,
    reportGrowth,
    clinicGrowthRate: growthRate(clinicGrowth),
    reportGrowthRate: growthRate(reportGrowth),
  }
}
