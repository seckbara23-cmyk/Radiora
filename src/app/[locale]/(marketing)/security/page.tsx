import { getTranslations, setRequestLocale } from 'next-intl/server'

interface Item {
  title: string
  desc: string
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return { title: t('nav.security') }
}

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')

  const items = t.raw('security.items') as Item[]

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="max-w-2xl">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('security.title')}</h1>
        <p className="mt-4 text-lg text-gray-500">{t('security.subtitle')}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-6">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
        <p className="text-sm text-amber-800">{t('security.note')}</p>
      </div>
    </div>
  )
}
