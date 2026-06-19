import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

interface Item {
  title: string
  desc: string
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return { title: t('nav.features') }
}

export default async function FeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')

  const items = t.raw('features.items') as Item[]

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('features.title')}</h1>
        <p className="mt-4 text-lg text-gray-500">{t('features.subtitle')}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border border-gray-100 bg-gray-50 px-8 py-10 text-center">
        <Link
          href="/signup"
          className="inline-block rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
        >
          {t('cta')}
        </Link>
      </div>
    </div>
  )
}
