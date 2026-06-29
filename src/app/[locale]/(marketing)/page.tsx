import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalStar } from '@/components/ui/senegal-accents'
import { RadioraDemo } from '@/components/marketing/radiora-demo'
import {
  ResultsBanner,
  SenegalSection,
  MobileDictation,
  PilotTestimonial,
  WhyRadiora,
  TrialCta,
} from '@/components/marketing/landing-sections'

export default async function MarketingHome({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')

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

      {/* 2. Interactive AI demo (moved directly under the hero) */}
      <section className="border-t border-gray-100 bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <ResultsBanner />
          <div className="mt-10">
            <RadioraDemo />
          </div>
        </div>
      </section>

      {/* 3. Clinical workflow — the single, unified "how it works" section */}
      <MobileDictation />

      {/* 4. Why Radiora — single benefits section (six cards) */}
      <WhyRadiora />

      {/* 5. Built with Senegalese radiologists (compact) */}
      <SenegalSection />

      {/* 6. Pilot testimonial */}
      <PilotTestimonial />

      {/* 7. Final CTA */}
      <TrialCta />
    </>
  )
}
