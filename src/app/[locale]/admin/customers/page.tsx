import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getCustomerSuccessOverview, type CustomerRow } from '@/lib/data/platform'
import { daysSince, type EngagementLevel, type TrialUrgency } from '@/lib/analytics/customer-success'
import { daysUntil, type SubscriptionStatus } from '@/lib/billing/subscription'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('customers.title') }
}

const ENGAGEMENT_STYLES: Record<EngagementLevel, string> = {
  new: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  at_risk: 'bg-amber-100 text-amber-800',
  dormant: 'bg-gray-200 text-gray-600',
}

const SUB_STYLES: Record<SubscriptionStatus, string> = {
  trial: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  grace: 'bg-amber-100 text-amber-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-600',
}

const URGENCY_STYLES: Record<TrialUrgency, string> = {
  expired: 'text-red-600',
  critical: 'text-red-600',
  upcoming: 'text-amber-600',
  comfortable: 'text-gray-400',
}

function StatCard({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? 'text-gray-900'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export default async function AdminCustomersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('admin')
  const { funnel, engagement, customers, generatedAt } = await getCustomerSuccessOverview()

  function lastLoginLabel(row: CustomerRow): string {
    if (!row.lastLoginAt) return t('customers.neverLoggedIn')
    const d = daysSince(row.lastLoginAt, generatedAt)
    if (d === null) return t('customers.neverLoggedIn')
    if (d === 0) return t('customers.today')
    return t('customers.daysAgo', { days: d })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('customers.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('customers.subtitle')}</p>
      </div>

      {/* Conversion funnel */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('customers.funnelHeading')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label={t('customers.totalClinics')} value={funnel.totalClinics} />
          <StatCard label={t('customers.trialing')} value={funnel.trialing} accent="text-blue-600" />
          <StatCard label={t('customers.paying')} value={funnel.paying} accent="text-green-600" />
          <StatCard label={t('customers.churned')} value={funnel.churned} accent="text-gray-500" />
          <StatCard
            label={t('customers.conversionRate')}
            value={`${funnel.conversionRate}%`}
            hint={t('customers.conversionHint')}
            accent="text-blue-700"
          />
        </div>
      </section>

      {/* Engagement */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('customers.engagementHeading')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={t('customers.engagementNew')} value={engagement.new} accent="text-blue-600" />
          <StatCard label={t('customers.engagementActive')} value={engagement.active} accent="text-green-600" />
          <StatCard label={t('customers.engagementAtRisk')} value={engagement.at_risk} accent="text-amber-600" />
          <StatCard label={t('customers.engagementDormant')} value={engagement.dormant} accent="text-gray-500" />
        </div>
      </section>

      {/* Per-clinic table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('customers.tableHeading')}</h2>
        {customers.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center text-sm text-gray-500">
            {t('customers.empty')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3 font-semibold">{t('customers.colClinic')}</th>
                    <th className="px-6 py-3 font-semibold">{t('customers.colSubscription')}</th>
                    <th className="hidden px-6 py-3 font-semibold lg:table-cell">{t('customers.colUsage')}</th>
                    <th className="px-6 py-3 font-semibold">{t('customers.colLastLogin')}</th>
                    <th className="px-6 py-3 font-semibold">{t('customers.colEngagement')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map((c) => (
                    <tr key={c.clinicId} className="hover:bg-gray-50">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-gray-900">{c.clinicName}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        {c.subscriptionStatus ? (
                          <>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${SUB_STYLES[c.subscriptionStatus]}`}>
                              {t(`state.${c.subscriptionStatus === 'active' ? 'active' : c.subscriptionStatus === 'trial' ? 'trialing' : c.subscriptionStatus}`)}
                            </span>
                            {c.subscriptionStatus === 'trial' && c.trialUrgency && (
                              <p className={`mt-1 text-[10px] ${URGENCY_STYLES[c.trialUrgency]}`}>
                                {c.trialUrgency === 'expired'
                                  ? t('customers.trialExpired')
                                  : t('customers.trialEndsIn', { days: Math.max(0, daysUntil(c.trialEndsAt, generatedAt) ?? 0) })}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">{t('customers.noSubscription')}</span>
                        )}
                      </td>
                      <td className="hidden px-6 py-3.5 text-xs text-gray-500 lg:table-cell">
                        <div>{t('customers.usageUsers', { count: c.userCount })}</div>
                        <div>{t('customers.usageReports', { count: c.reportCount })}</div>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-600">{lastLoginLabel(c)}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ENGAGEMENT_STYLES[c.engagement]}`}>
                          {t(`customers.engagementLevel.${c.engagement}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400">{t('customers.privacyNote')}</p>
      </section>
    </div>
  )
}
