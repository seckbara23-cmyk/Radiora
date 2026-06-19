import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getBillingOverview } from '@/lib/data/platform'
import { formatXof } from '@/lib/billing/format'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('billing.title') }
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}

export default async function AdminBillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('admin')
  const o = await getBillingOverview()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('billing.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('billing.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('billing.mrr')} value={formatXof(o.mrrXof)} />
        <StatCard label={t('billing.paidThisMonth')} value={formatXof(o.paidThisMonthXof)} />
        <StatCard label={t('billing.activeSubs')} value={o.statusCounts.active + o.statusCounts.grace} />
        <StatCard label={t('billing.trialSubs')} value={o.statusCounts.trial} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expiring soon */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('billing.expiringSoon')}</h2>
          {o.expiring.length === 0 ? (
            <p className="text-sm text-gray-500">{t('billing.noneExpiring')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {o.expiring.map((e) => (
                <li key={e.clinicId} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/clinics/${e.clinicId}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {e.clinicName}
                  </Link>
                  <span className="text-gray-500">
                    {t(`state.${e.status === 'trial' ? 'trialing' : e.status}`)}
                    {e.endsAt ? ` · ${e.endsAt.slice(0, 10)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Failed payments */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('billing.failedPayments')}</h2>
          {o.failedPayments.length === 0 ? (
            <p className="text-sm text-gray-500">{t('billing.noFailed')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {o.failedPayments.map((f, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/clinics/${f.clinicId}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {f.clinicName}
                  </Link>
                  <span className="text-gray-500">
                    {f.method} · {f.attemptedAt.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-gray-400">{t('billing.privacyNote')}</p>
    </div>
  )
}
