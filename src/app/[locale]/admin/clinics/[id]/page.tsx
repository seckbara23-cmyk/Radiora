import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getTenantDetail } from '@/lib/data/platform'
import type { AccessState } from '@/lib/billing/subscription'
import { TenantActions } from '../TenantActions'

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

      <p className="text-xs text-gray-400">{t('detail.privacyNote')}</p>
    </div>
  )
}
