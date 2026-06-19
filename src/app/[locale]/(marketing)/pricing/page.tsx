import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

interface PlanCard {
  name: string
  price: string
  desc: string
  features: string[]
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return { title: t('nav.pricing') }
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')

  const plans = t.raw('pricing.plans') as PlanCard[]
  const onRequest = /[a-zA-Z]/.test(plans[2]?.price ?? '') // Enterprise = "On request" / "Sur devis"

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('pricing.title')}</h1>
        <p className="mt-4 text-lg text-gray-500">{t('pricing.subtitle')}</p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((plan, i) => {
          const highlighted = i === 1 // Professional
          const isEnterprise = i === 2
          const priceIsNumber = /\d/.test(plan.price)
          return (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-7 ${
                highlighted ? 'border-blue-400 ring-1 ring-blue-200 shadow-sm' : 'border-gray-200'
              }`}
            >
              {highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  {t('pricing.popular')}
                </span>
              )}
              <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              <p className="mt-3 text-3xl font-bold text-gray-900">
                {plan.price}
                {priceIsNumber && <span className="text-sm font-normal text-gray-500"> {t('pricing.perMonth')}</span>}
              </p>
              <p className="mt-2 text-sm text-gray-500">{plan.desc}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-green-500">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={isEnterprise && onRequest ? '/contact' : '/signup'}
                className={`mt-7 rounded-xl px-5 py-3 text-center text-sm font-semibold transition ${
                  highlighted
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'
                    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {isEnterprise && onRequest ? t('pricing.contactCta') : t('pricing.cta')}
              </Link>
            </div>
          )
        })}
      </div>

      <p className="mt-10 text-center text-sm text-gray-400">{t('pricing.note')}</p>
    </div>
  )
}
