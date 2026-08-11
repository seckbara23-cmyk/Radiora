import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ProductMockup } from '@/components/marketing/product-mockup'
import {
  CoreWorkflow,
  RadioraInAction,
  ValuePoints,
  TrialCta,
} from '@/components/marketing/landing-sections'

// R2.8 landing rebuild — the homepage explains Radiora in seconds.
//
// It had grown to nine sections that each restated the same workflow, so a
// visitor had to read a long page to learn one idea. It is now five:
//
//   hero (with the product mockup) → lifecycle → Radiora en action
//   → four value points → final CTA
//
// The heavy interactive demo (~450 lines of client JS) moved off the homepage
// entirely; /demo still composes it, so nothing was lost and the landing page
// now ships almost no client JavaScript.

const CAPABILITY_ICONS = [
  // Dictate
  (c: string) => (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M19 11a7 7 0 01-14 0M12 18v3" />
    </svg>
  ),
  // Phone via QR
  (c: string) => (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="6" height="6" strokeWidth={1.6} />
      <rect x="14.5" y="3.5" width="6" height="6" strokeWidth={1.6} />
      <rect x="3.5" y="14.5" width="6" height="6" strokeWidth={1.6} />
      <path strokeLinecap="round" strokeWidth={1.6} d="M14.5 15h2.5v2.5M20.5 15v2M15 20.5h5.5" />
    </svg>
  ),
  // AI structures
  (c: string) => (
    <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" strokeWidth={1.6} />
      <path strokeLinecap="round" strokeWidth={1.6} d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2" />
    </svg>
  ),
]

export default async function MarketingHome({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t  = await getTranslations('marketing')
  const tL = await getTranslations('landing')
  const tE = await getTranslations('reportEditor')

  const capabilities = tL.raw('capabilities') as Array<{ label: string; desc: string }>

  return (
    <>
      {/* ── 1. Hero ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-10 lg:pb-20 lg:pt-20">

          <div>
            <h1 className="text-4xl font-bold leading-[1.12] tracking-tight text-gray-900 sm:text-5xl">
              {t('home.hero')}
              <br />
              <span className="text-blue-600">{t('home.heroHighlight')}</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-gray-500">
              {t('home.heroDesc')}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
              >
                {t('ctaShort')}
              </Link>
              <Link
                href="/#workflow"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {t('home.secondary')}
              </Link>
            </div>

            {/* Three compact capability indicators */}
            <ul className="mt-10 grid grid-cols-3 gap-4 border-t border-gray-100 pt-7">
              {capabilities.map((cap, i) => (
                <li key={i}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    {CAPABILITY_ICONS[i]('h-4 w-4')}
                  </span>
                  <p className="mt-2 text-[13px] font-semibold text-gray-900">{cap.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{cap.desc}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* The product itself, as the explanation. */}
          <ProductMockup
            className="mx-auto w-full max-w-[30rem] lg:mr-0"
            labels={{
              alt:            tL('mockup.alt'),
              newReport:      tL('mockup.newReport'),
              reports:        tL('mockup.reports'),
              templates:      tL('mockup.templates'),
              patientLabel:   tL('mockup.patientLabel'),
              examLabel:      tL('mockup.examLabel'),
              dateLabel:      tL('mockup.dateLabel'),
              patientValue:   tL('mockup.patientValue'),
              examValue:      tL('mockup.examValue'),
              dateValue:      tL('mockup.dateValue'),
              saveDraft:      tL('mockup.saveDraft'),
              reviewSign:     tL('mockup.reviewSign'),
              phoneTitle:     tL('mockup.phoneTitle'),
              phoneSubtitle:  tL('mockup.phoneSubtitle'),
              phoneTimer:     tL('mockup.phoneTimer'),
              phoneRecording: tL('mockup.phoneRecording'),
              phoneSend:      tL('mockup.phoneSend'),
            }}
            report={{
              indication: tL('action.report.indication'),
              technique:  tL('action.report.technique'),
              results:    tL('action.report.results'),
              conclusion: tL('action.report.conclusion'),
            }}
            sectionLabels={{
              indication: tE('indicationLabel'),
              technique:  tE('techniqueLabel'),
              results:    tE('resultsLabel'),
              conclusion: tE('conclusionLabel'),
            }}
          />
        </div>
      </section>

      {/* ── 2. Lifecycle ── */}
      <CoreWorkflow />

      {/* ── 3. Speech → structured report ── */}
      <RadioraInAction />

      {/* ── 4. Four value points ── */}
      <ValuePoints />

      {/* ── 5. Final CTA ── */}
      <TrialCta />
    </>
  )
}
