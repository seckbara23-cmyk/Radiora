import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalStar } from '@/components/ui/senegal-accents'
import { RadiologyScanMark } from '@/components/marketing/radiology-visual'
import { RadioraDemo } from '@/components/marketing/radiora-demo'
import {
  ResultsBanner,
  CoreWorkflow,
  SenegalSection,
  MobileDictation,
  AiAssistSection,
  ReportOutputSection,
  TrustStripSection,
  WhyRadiora,
  PilotTestimonial,
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
      {/* Hero — R2.8: calm single-tone wash instead of a diagonal tri-color
          gradient; "Se connecter" is the primary action (most visitors already
          have an account), the trial stays one line below as a plain link. */}
      <section className="relative overflow-hidden bg-slate-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-24 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <SenegalStar className="text-[#00853F]" />
              {t('home.badge')}
            </div>
            <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
              {t('home.hero')}{' '}
              <span className="text-blue-600">{t('home.heroHighlight')}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-500">{t('home.heroDesc')}</p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:items-start">
              <Link
                href="/login"
                className="rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
              >
                {t('signIn')}
              </Link>
              <Link
                href="/#workflow"
                className="rounded-xl px-6 py-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                {t('home.secondary')} →
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-500">
              {t('home.trialHint')}{' '}
              <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                {t('cta')}
              </Link>
            </p>
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 lg:justify-start">
              <SenegalStar className="text-[#00853F] opacity-70" />
              {t('home.trust')}
            </p>
          </div>

          {/* Decorative radiology mark — abstract, never a real study. Hidden on
              small screens so it never competes with the copy or the CTAs. */}
          <RadiologyScanMark className="hidden h-64 w-64 shrink-0 text-blue-600/25 lg:block" />
        </div>
      </section>

      {/* Six-stage core workflow — anchors the header's "Fonctionnement" link
          and the hero's secondary CTA. */}
      <CoreWorkflow />

      {/* Interactive AI demo — real pipeline, client-side only, no network. */}
      <section className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <ResultsBanner />
          <div className="mt-10">
            <RadioraDemo />
          </div>
        </div>
      </section>

      {/* Dictation modes: computer / phone / import, phone flow detailed */}
      <MobileDictation />

      {/* AI assists, radiologist decides — the authority statement, prominent */}
      <AiAssistSection />

      {/* What comes out the other end */}
      <ReportOutputSection />

      {/* Trust strip — factual claims only, links to /security for detail */}
      <TrustStripSection />

      {/* Why Radiora — six-card benefits grid */}
      <WhyRadiora />

      {/* Built with Senegalese radiologists */}
      <SenegalSection />

      {/* Pilot testimonial */}
      <PilotTestimonial />

      {/* Final CTA */}
      <TrialCta />
    </>
  )
}
