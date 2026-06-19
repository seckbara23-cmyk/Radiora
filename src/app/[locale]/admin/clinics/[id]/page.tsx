import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getTenantDetail, getTenantBilling } from '@/lib/data/platform'
import type { AccessState } from '@/lib/billing/subscription'
import { formatXof } from '@/lib/billing/format'
import { TenantActions } from '../TenantActions'
import { TenantPlanControls } from './TenantPlanControls'
import { IssueInvoiceButton, PaymentReconcile } from './BillingControls'

const STATE_STYLES: Record<AccessState, string> = {
  active:    'bg-green-100 text-green-800',
  trialing:  'bg-blue-100 text-blue-800',
  grace:     'bg-amber-100 text-amber-800',
  expired:   'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700',
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const t = await getTranslations('admin')
  const tenant = await getTenantDetail(id)
  if (!tenant) notFound()

  const billing = await getTenantBilling(id)

  const sub = tenant.subscription
  const endLabel =
    sub?.status === 'trial'
      ? sub.trial_ends_at
      : sub?.status === 'grace'
        ? sub.grace_ends_at
        : sub?.current_period_end

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clinics" className="text-sm text-blue-600 hover:text-blue-700">
          ← {t('nav.clinics')}
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{tenant.name}</h1>
          <p className="font-mono text-xs text-gray-400">{tenant.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATE_STYLES[tenant.access.state]}`}>
            {t(`state.${tenant.access.state}`)}
          </span>
          <TenantActions
            clinicId={tenant.id}
            status={tenant.status}
            labels={{ suspend: t('clinics.suspend'), reactivate: t('clinics.reactivate') }}
          />
        </div>
      </div>

      {/* Usage metrics (no clinical content) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label={t('detail.radiologists')} value={tenant.radiologistCount} />
        <Metric label={t('detail.staff')} value={tenant.technicianCount} />
        <Metric label={t('detail.totalUsers')} value={tenant.userCount} />
        <Metric label={t('detail.reports')} value={tenant.reportCount} />
        <Metric label={t('detail.studies')} value={tenant.studyCount} />
        <Metric label={t('detail.patients')} value={tenant.patientCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('detail.subscription')}</h2>
          <div className="divide-y divide-gray-100">
            <Row label={t('detail.plan')} value={(tenant.planId ?? tenant.plan) as string} />
            <Row label={t('detail.status')} value={t(`state.${tenant.access.state}`)} />
            {endLabel && <Row label={t('detail.renews')} value={endLabel.slice(0, 10)} />}
            {tenant.access.daysLeft !== null && (
              <Row label={t('detail.daysLeft')} value={String(tenant.access.daysLeft)} />
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('detail.contact')}</h2>
          <div className="divide-y divide-gray-100">
            {tenant.email && <Row label="Email" value={tenant.email} />}
            {tenant.phone && <Row label={t('detail.phone')} value={tenant.phone} />}
            {tenant.city && <Row label={t('detail.location')} value={`${tenant.city}, ${tenant.country ?? ''}`} />}
            <Row label={t('detail.created')} value={tenant.createdAt.slice(0, 10)} />
          </div>
        </section>
      </div>

      {/* Tenant lifecycle management — extend trial, upgrade / downgrade plan */}
      <TenantPlanControls
        clinicId={tenant.id}
        currentPlan={tenant.planId}
        labels={{
          heading: t('manage.heading'),
          extendTrial: t('manage.extendTrial'),
          days: t('manage.days'),
          extend: t('manage.extend'),
          changePlan: t('manage.changePlan'),
          plan: t('manage.plan'),
          apply: t('manage.apply'),
          starter: t('manage.plans.starter'),
          professional: t('manage.plans.professional'),
          enterprise: t('manage.plans.enterprise'),
          note: t('manage.note'),
        }}
      />

      {/* Billing — invoices & payment reconciliation (metadata only) */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{t('billingTenant.heading')}</h2>
          <IssueInvoiceButton clinicId={tenant.id} label={t('billingTenant.issueInvoice')} />
        </div>

        {billing.invoices.length === 0 ? (
          <p className="text-sm text-gray-500">{t('billingTenant.noInvoices')}</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="py-2 font-medium">{t('billingTenant.invoice')}</th>
                <th className="py-2 font-medium">{t('billingTenant.date')}</th>
                <th className="py-2 font-medium">{t('billingTenant.amount')}</th>
                <th className="py-2 font-medium">{t('billingTenant.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {billing.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2 font-mono text-xs text-gray-700">{inv.number}</td>
                  <td className="py-2 text-gray-600">{inv.issuedAt.slice(0, 10)}</td>
                  <td className="py-2 text-gray-900">{formatXof(inv.amountXof)}</td>
                  <td className="py-2 text-gray-600">{t(`billingTenant.invoiceStates.${inv.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {billing.payments.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t('billingTenant.payments')}
            </h3>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 font-medium">{t('billingTenant.method')}</th>
                  <th className="py-2 font-medium">{t('billingTenant.amount')}</th>
                  <th className="py-2 font-medium">{t('billingTenant.status')}</th>
                  <th className="py-2 font-medium text-right">{t('billingTenant.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billing.payments.map((pay) => (
                  <tr key={pay.id}>
                    <td className="py-2 text-gray-700">{t(`billingTenant.methods.${pay.method}`)}</td>
                    <td className="py-2 text-gray-900">{formatXof(pay.amountXof)}</td>
                    <td className="py-2 text-gray-600">{t(`billingTenant.paymentStates.${pay.status}`)}</td>
                    <td className="py-2 text-right">
                      {pay.status === 'pending' ? (
                        <PaymentReconcile
                          paymentId={pay.id}
                          labels={{ confirm: t('billingTenant.confirm'), fail: t('billingTenant.fail') }}
                        />
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">{t('detail.privacyNote')}</p>
    </div>
  )
}
