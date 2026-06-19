import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getClinicAccess } from '@/lib/billing/access'
import { getClinicSubscription, getPlans, getClinicInvoices } from '@/lib/data/billing'
import type { AccessState } from '@/lib/billing/subscription'
import { invoiceIsPayable } from '@/lib/billing/payments'
import { PayInvoice } from './PayInvoice'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'billing' })
  return { title: t('title') }
}

function formatXof(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}

const STATE_STYLES: Record<AccessState, string> = {
  active:    'bg-green-100 text-green-800',
  trialing:  'bg-blue-100 text-blue-800',
  grace:     'bg-amber-100 text-amber-800',
  expired:   'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700',
}

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('billing')
  const user = await requireCurrentUser()

  const [access, subscription, plans, invoices] = await Promise.all([
    getClinicAccess(user.clinicId),
    user.clinicId ? getClinicSubscription(user.clinicId) : Promise.resolve(null),
    getPlans(),
    user.clinicId ? getClinicInvoices(user.clinicId) : Promise.resolve([]),
  ])

  const currentPlan = subscription
    ? plans.find((p) => p.id === subscription.planId) ?? null
    : null

  const canPay = user.role === 'clinic_admin' || user.role === 'super_admin'
  const payLabels = {
    pay: t('pay.pay'),
    cancel: t('pay.cancel'),
    chooseMethod: t('pay.chooseMethod'),
    confirm: t('pay.confirm'),
    pendingTitle: t('pay.pendingTitle'),
    pendingBody: t('pay.pendingBody'),
    reference: t('pay.reference'),
    methods: {
      wave: t('pay.methods.wave'),
      orange_money: t('pay.methods.orange_money'),
      card: t('pay.methods.card'),
    },
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      {/* Current subscription summary */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {t('currentPlan')}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {currentPlan ? currentPlan.name : t('noPlan')}
            </p>
            {currentPlan && (
              <p className="mt-0.5 text-sm text-gray-500">
                {currentPlan.priceXof > 0
                  ? t('perMonth', { amount: formatXof(currentPlan.priceXof) })
                  : t('customPricing')}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATE_STYLES[access.state]}`}
          >
            {t(`state.${access.state}`)}
          </span>
        </div>

        {access.daysLeft !== null && (access.state === 'trialing' || access.state === 'grace') && (
          <p className="mt-4 text-sm text-gray-600">
            {access.state === 'trialing'
              ? t('banner.trialEnding', { days: access.daysLeft })
              : t('banner.graceEnding', { days: access.daysLeft })}
          </p>
        )}
        {access.readOnly && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            {t('banner.readOnlyBody')}
          </p>
        )}
      </section>

      {/* Plan catalogue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('plansHeading')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.id === plan.id
            return (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white p-5 ${
                  isCurrent ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {t('current')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {plan.priceXof > 0 ? formatXof(plan.priceXof) : t('onRequest')}
                  {plan.priceXof > 0 && (
                    <span className="text-sm font-normal text-gray-500"> /{t('month')}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                {plan.features.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-600">
                        <span className="text-green-500">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-gray-400">{t('changeHint')}</p>
      </section>

      {/* Invoices */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('invoicesHeading')}</h2>
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white px-6 py-5 text-sm text-gray-500">
            {t('noInvoices')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('invoiceNumber')}</th>
                  <th className="px-4 py-3 font-medium">{t('invoiceDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('invoiceAmount')}</th>
                  <th className="px-4 py-3 font-medium">{t('invoiceStatus')}</th>
                  {canPay && <th className="px-4 py-3 font-medium text-right">{t('pay.action')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.number}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.issuedAt.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-gray-900">{formatXof(inv.amountXof)}</td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600">{t(`invoiceStates.${inv.status}`)}</span>
                    </td>
                    {canPay && (
                      <td className="px-4 py-3 text-right">
                        {invoiceIsPayable(inv.status) ? (
                          <div className="flex justify-end">
                            <PayInvoice invoiceId={inv.id} labels={payLabels} />
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
