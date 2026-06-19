import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalDots, SenegalStar } from '@/components/ui/senegal-accents'

// Conversion-oriented landing sections. All are static, French-first, server-
// rendered marketing content — no client JS, no backend/DB/API, no tracking.
// They reuse the existing design system (rounded-2xl cards, blue-600 / emerald
// accents, Senegal accents). Decorative glyphs are aria-hidden; each section is
// a labelled landmark for assistive tech.

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.3 3.29 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ArrowDown({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m0 0l-5-5m5 5l5-5" />
    </svg>
  )
}

// ── Section 1 — Results banner (sits directly above the demo) ─────────────────
export async function ResultsBanner() {
  const t = await getTranslations('landing')
  const items = t.raw('banner.items') as string[]
  return (
    <section aria-label={t('banner.items.0')} className="mx-auto max-w-5xl">
      <ul className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-xl bg-emerald-50/50 px-3 py-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <CheckIcon className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-sm font-medium leading-snug text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Section 2 — "Conçu pour le Sénégal" (directly below the demo) ─────────────
export async function SenegalSection() {
  const t = await getTranslations('landing')
  const modalities = t.raw('senegal.modalities') as string[]
  return (
    <section aria-labelledby="senegal-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <SenegalStar className="text-[#00853F]" />
            Sénégal
          </span>
          <h2 id="senegal-heading" className="mt-5 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('senegal.title')}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-500">{t('senegal.body')}</p>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {modalities.map((m, i) => (
            <li
              key={i}
              className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-slate-50 p-6 text-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CheckIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-gray-900">{m}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 flex items-center justify-center gap-2 text-center text-sm font-medium text-gray-600">
          <SenegalDots />
          {t('senegal.footer')}
        </p>
      </div>
    </section>
  )
}

// ── Section 3 — Mobile dictation workflow ─────────────────────────────────────
const MOBILE_EMOJI = ['📱', '🔗', '🎙', '🧠', '✅', '📄']

export async function MobileDictation() {
  const t = await getTranslations('landing')
  const steps = t.raw('mobile.steps') as string[]
  return (
    <section aria-labelledby="mobile-heading" className="border-t border-gray-100 bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="mobile-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('mobile.title')}
          </h2>
          <p className="mt-4 text-lg text-gray-500">{t('mobile.subtitle')}</p>
        </div>

        {/* Flow: horizontal on desktop, vertical on mobile */}
        <ol className="mt-12 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-center md:gap-0">
          {steps.map((step, i) => (
            <li key={i} className="contents">
              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm md:min-h-[112px] md:w-[140px] md:flex-col md:justify-center md:gap-2 md:px-3 md:text-center">
                <span className="text-2xl" aria-hidden="true">{MOBILE_EMOJI[i]}</span>
                <span className="text-sm font-semibold text-gray-800">{step}</span>
              </div>
              {i < steps.length - 1 && (
                <span className="flex justify-center text-blue-400 md:px-1" aria-hidden="true">
                  <ArrowDown className="h-5 w-5 md:-rotate-90" />
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
            <CheckIcon className="h-4 w-4 text-emerald-500" />
            {t('mobile.note1')}
          </p>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
            <CheckIcon className="h-4 w-4 text-emerald-500" />
            {t('mobile.note2')}
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Section 4 — ROI / productivity comparison ─────────────────────────────────
function FlowColumn({
  title,
  steps,
  tone,
}: {
  title: string
  steps: string[]
  tone: 'muted' | 'brand'
}) {
  const brand = tone === 'brand'
  return (
    <div
      className={[
        'rounded-2xl border p-6',
        brand ? 'border-blue-200 bg-blue-50/60' : 'border-gray-200 bg-gray-50',
      ].join(' ')}
    >
      <h3 className={['text-center text-sm font-bold uppercase tracking-wide', brand ? 'text-blue-700' : 'text-gray-500'].join(' ')}>
        {title}
      </h3>
      <ol className="mt-5 flex flex-col items-center gap-2">
        {steps.map((step, i) => (
          <li key={i} className="contents">
            <span
              className={[
                'w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium',
                brand ? 'bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-blue-100' : 'bg-white text-gray-600 ring-1 ring-inset ring-gray-100',
              ].join(' ')}
            >
              {step}
            </span>
            {i < steps.length - 1 && (
              <ArrowDown className={['h-4 w-4', brand ? 'text-blue-400' : 'text-gray-300'].join(' ')} />
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export async function RoiComparison() {
  const t = await getTranslations('landing')
  return (
    <section aria-labelledby="roi-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-4xl px-6 py-20">
        <div className="text-center">
          <h2 id="roi-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('roi.title')}
          </h2>
          <span className="mt-5 inline-block rounded-full bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white">
            {t('roi.volume')}
          </span>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <FlowColumn title={t('roi.withoutTitle')} steps={t.raw('roi.withoutSteps') as string[]} tone="muted" />
          <FlowColumn title={t('roi.withTitle')} steps={t.raw('roi.withSteps') as string[]} tone="brand" />
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm font-medium text-gray-600">{t('roi.footer')}</p>
      </div>
    </section>
  )
}

// ── Section 5 — Pilot program testimonial ─────────────────────────────────────
export async function PilotTestimonial() {
  const t = await getTranslations('landing')
  return (
    <section aria-labelledby="testimonial-heading" className="border-t border-gray-100 bg-gradient-to-br from-slate-50 to-blue-50/50">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <figure className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <SenegalStar className="text-[#00853F]" />
            {t('testimonial.badge')}
          </span>

          <svg className="mt-6 h-9 w-9 text-blue-200" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.5 7C6.5 7 4 9.5 4 12.5V19h7v-7H7.5c0-1.7 1.3-3 3-3V7Zm9 0c-3 0-5.5 2.5-5.5 5.5V19h7v-7H16c0-1.7 1.3-3 3-3V7Z" />
          </svg>

          <blockquote id="testimonial-heading" className="mt-3 text-xl font-medium leading-relaxed text-gray-900">
            {t('testimonial.quote')}
          </blockquote>

          <figcaption className="mt-6 flex items-center gap-4 border-t border-gray-100 pt-6">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white"
              aria-hidden="true"
            >
              AB
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">{t('testimonial.name')}</span>
              <span className="block text-sm text-gray-500">{t('testimonial.role')}</span>
            </span>
          </figcaption>
        </figure>

        <p className="mt-5 text-center text-xs text-gray-400">{t('testimonial.note')}</p>
      </div>
    </section>
  )
}

// ── Section 6 — Trial CTA ─────────────────────────────────────────────────────
export async function TrialCta() {
  const t = await getTranslations('landing')
  return (
    <section aria-labelledby="trial-heading" className="bg-blue-600">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 id="trial-heading" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {t('trial.headline')}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-blue-100">
          {t('trial.subtext1')}
          <br />
          {t('trial.subtext2')}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
          >
            {t('trial.primary')}
          </Link>
          <Link
            href="/contact"
            className="rounded-xl px-6 py-3.5 text-sm font-medium text-white ring-1 ring-inset ring-white/40 transition hover:bg-blue-500"
          >
            {t('trial.secondary')}
          </Link>
        </div>
      </div>
    </section>
  )
}
