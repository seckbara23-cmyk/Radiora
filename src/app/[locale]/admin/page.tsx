import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPlatformAnalytics } from '@/lib/data/platform'
import type { MonthlyPoint } from '@/lib/billing/metrics'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('overview.title') }
}

function StatCard({ label, value, delta }: { label: string; value: string | number; delta?: number | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={`mt-1 text-xs font-medium ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% {''}
        </p>
      )}
    </div>
  )
}

function MiniBars({ points }: { points: MonthlyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count))
  return (
    <div className="flex items-end gap-2" style={{ height: 96 }}>
      {points.map((p) => (
        <div key={p.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-blue-500"
              style={{ height: `${(p.count / max) * 100}%`, minHeight: p.count > 0 ? 4 : 0 }}
              title={`${p.month}: ${p.count}`}
            />
          </div>
          <span className="text-[10px] text-gray-400">{p.month.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('admin')
  const a = await getPlatformAnalytics()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('overview.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('overview.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('overview.totalClinics')} value={a.totals.clinics} delta={a.clinicGrowthRate} />
        <StatCard label={t('overview.totalRadiologists')} value={a.totals.radiologists} />
        <StatCard label={t('overview.totalReports')} value={a.totals.reports} delta={a.reportGrowthRate} />
        <StatCard label={t('overview.totalDictations')} value={a.totals.dictations} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('overview.clinicGrowth')}</h2>
          <MiniBars points={a.clinicGrowth} />
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('overview.reportGrowth')}</h2>
          <MiniBars points={a.reportGrowth} />
        </section>
      </div>

      <p className="text-xs text-gray-400">{t('overview.privacyNote')}</p>
    </div>
  )
}
