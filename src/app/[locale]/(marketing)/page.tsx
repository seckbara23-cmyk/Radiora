import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalStar } from '@/components/ui/senegal-accents'

interface Highlight {
  title: string
  desc: string
}

export default async function MarketingHome({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')

  const highlights = t.raw('home.highlights') as Highlight[]

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <SenegalStar className="text-[#00853F]" />
            {t('home.badge')}
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
            {t('home.hero')}{' '}
            <span className="text-blue-600">{t('home.heroHighlight')}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-500">{t('home.heroDesc')}</p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              {t('cta')}
            </Link>
            <Link
              href="/features"
              className="rounded-xl px-6 py-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              {t('home.secondary')} →
            </Link>
          </div>
          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <SenegalStar className="text-[#00853F] opacity-70" />
            {t('home.trust')}
          </p>
        </div>
      </section>

      {/* Highlights */}
      <section className="border-t border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t('home.highlightsHeading')}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((h, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-gray-900">{h.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-blue-600">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('home.bandTitle')}</h2>
          <p className="mt-3 text-base text-blue-100">{t('home.bandDesc')}</p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-block rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
            >
              {t('cta')}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
