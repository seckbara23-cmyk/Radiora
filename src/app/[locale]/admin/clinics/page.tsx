import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { listTenants } from '@/lib/data/platform'
import type { AccessState } from '@/lib/billing/subscription'
import { TenantActions } from './TenantActions'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('clinics.title') }
}

const STATE_STYLES: Record<AccessState, string> = {
  active:    'bg-green-100 text-green-800',
  trialing:  'bg-blue-100 text-blue-800',
  grace:     'bg-amber-100 text-amber-800',
  expired:   'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700',
}

export default async function AdminClinicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('admin')
  const tenants = await listTenants()

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('clinics.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('clinics.count', { count: tenants.length })}
          </p>
        </div>
        <Link
          href="/admin/onboarding"
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:self-auto"
        >
          {t('clinics.newClinic')}
        </Link>
      </div>

      {tenants.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center text-sm text-gray-500">
          {t('clinics.empty')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-semibold">{t('clinics.colClinic')}</th>
                  <th className="px-6 py-3 font-semibold">{t('clinics.colPlan')}</th>
                  <th className="hidden px-6 py-3 font-semibold lg:table-cell">{t('clinics.colUsage')}</th>
                  <th className="px-6 py-3 font-semibold">{t('clinics.colStatus')}</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tenants.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3.5">
                      <Link href={`/admin/clinics/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {c.name}
                      </Link>
                      <p className="font-mono text-xs text-gray-400">{c.slug}</p>
                      {c.city && <p className="text-xs text-gray-400">{c.city}, {c.country}</p>}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                        {c.planId ?? c.plan}
                      </span>
                    </td>
                    <td className="hidden px-6 py-3.5 text-xs text-gray-500 lg:table-cell">
                      <div>{t('clinics.usageRadiologists', { count: c.radiologistCount })}</div>
                      <div>{t('clinics.usageReports', { count: c.reportCount })}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLES[c.access.state]}`}>
                        {t(`state.${c.access.state}`)}
                      </span>
                      {c.access.daysLeft !== null && (c.access.state === 'trialing' || c.access.state === 'grace') && (
                        <p className="mt-1 text-[10px] text-gray-400">
                          {t('clinics.daysLeft', { days: c.access.daysLeft })}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <TenantActions
                        clinicId={c.id}
                        status={c.status}
                        labels={{ suspend: t('clinics.suspend'), reactivate: t('clinics.reactivate') }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400">{t('clinics.privacyNote')}</p>
    </div>
  )
}
