import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Waveform } from '@/components/marketing/product-mockup'

// Public landing sections. Static, French-first, server-rendered — no client
// JS, no backend/DB/API, no tracking. Decorative glyphs are aria-hidden and
// each section is a labelled landmark.
//
// ─── R2.8 landing rebuild ────────────────────────────────────────────────────
// The homepage had grown to nine sections that each re-explained the same
// workflow: a phone-dictation walkthrough, a standalone "L'IA assiste" block, a
// standalone output-formats block, a standalone security strip, a six-card
// benefits grid, a Senegal positioning block and a testimonial. A visitor had
// to read a long page to learn one idea.
//
// It is now four sections — lifecycle strip, "Radiora en action", four value
// points, final CTA — matching the approved reference. Removed with them:
// SenegalSection, MobileDictation, AiAssistSection, ReportOutputSection,
// TrustStripSection, WhyRadiora, PilotTestimonial. Their translation content
// went too, except the authority sentence, which now lives inside the demo
// section where it carries more weight than it did as its own banner.
//
// ResultsBanner stays: /demo still composes it.

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

type IconFn = (className: string) => React.ReactNode

const iconMic: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M19 11a7 7 0 01-14 0M12 18v3" />
  </svg>
)
const iconCpu: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="7" y="7" width="10" height="10" rx="1.5" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2" />
  </svg>
)
const iconEye: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.5" strokeWidth={1.6} />
  </svg>
)
const iconSignature: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 18c2-4 3-7 4.5-7s1 4 2.5 4 3-6 4.5-6 1.5 5 3 5 1.5-2 2.5-2" />
    <path strokeLinecap="round" strokeWidth={1.6} d="M4 21h16" />
  </svg>
)
const iconSend: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M21 3L11 13M21 3l-6.5 18-4-8-8-4L21 3z" />
  </svg>
)
const iconPatient: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="3.5" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
  </svg>
)
const iconClock: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 7.5V12l3 2" />
  </svg>
)
const iconStethoscope: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 3v6a4 4 0 008 0V3M10 17a5 5 0 005-5v-1" />
    <circle cx="18.5" cy="17.5" r="2" strokeWidth={1.6} />
  </svg>
)
const iconPhone: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6.5" y="2.5" width="11" height="19" rx="2" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M11 18.5h2" />
  </svg>
)
const iconShield: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.5 12l2 2 3.5-3.5" />
  </svg>
)

// ── Results banner — consumed by /demo only ───────────────────────────────────
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

// ── 2. Lifecycle strip ────────────────────────────────────────────────────────
// A LIFECYCLE INDICATOR, not six content sections. One compact horizontal row.
const WORKFLOW_ICONS: IconFn[] = [iconPatient, iconMic, iconCpu, iconEye, iconSignature, iconSend]

export async function CoreWorkflow() {
  const t = await getTranslations('landing')
  const steps = t.raw('workflow.steps') as Array<{ label: string; desc: string }>
  return (
    <section id="workflow" aria-labelledby="workflow-heading" className="scroll-mt-20 border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 id="workflow-heading" className="text-center text-2xl font-bold tracking-tight text-gray-900">
          {t('workflow.title')}
        </h2>

        <ol className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map((step, i) => (
            <li key={i} className="relative flex flex-col items-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
                {WORKFLOW_ICONS[i]('h-[18px] w-[18px]')}
              </span>
              <span className="mt-2 text-[10px] font-semibold text-blue-600">{i + 1}</span>
              <h3 className="mt-0.5 text-[13px] font-semibold leading-tight text-gray-900">{step.label}</h3>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{step.desc}</p>
              {i < steps.length - 1 && (
                <span className="absolute right-[-10px] top-4 hidden text-gray-300 lg:block" aria-hidden="true">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── 3. Radiora en action ──────────────────────────────────────────────────────
// The one place the product is DEMONSTRATED rather than described: dictated
// speech on the left, the structured report it becomes on the right. Static —
// the interactive version of this lives on /demo and no longer loads its ~450
// lines of client JS on the homepage.
export async function RadioraInAction() {
  const t  = await getTranslations('landing')
  const tE = await getTranslations('reportEditor')

  const points = t.raw('action.points') as string[]
  const sections: Array<[string, string]> = [
    [tE('indicationLabel'), t('action.report.indication')],
    [tE('techniqueLabel'),  t('action.report.technique')],
    [tE('resultsLabel'),    t('action.report.results')],
    [tE('conclusionLabel'), t('action.report.conclusion')],
  ]

  return (
    <section aria-labelledby="action-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 rounded-3xl bg-slate-50 p-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-8 lg:p-8">

          {/* Explanation */}
          <div>
            <h2 id="action-heading" className="text-xl font-bold tracking-tight text-gray-900">
              {t('action.heading')}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('action.body')}</p>
            <ul className="mt-4 space-y-2">
              {points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-gray-700">
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {p}
                </li>
              ))}
            </ul>
            {/* The safety invariants, integrated rather than each given its own
                banner section. The wording is unchanged from R2.8 — only where
                it appears moved. */}
            <p className="mt-4 border-t border-gray-200 pt-3 text-[11px] font-medium leading-relaxed text-blue-800">
              {t('action.authority')}
            </p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
              {t('action.boundary')}
            </p>
          </div>

          {/* Speech → structure */}
          <div className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            {/* Dictation */}
            <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-900">{t('action.liveTitle')}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600">
                  <span className="h-1 w-1 rounded-full bg-red-500" />
                  {t('action.liveBadge')}
                </span>
              </div>
              <p className="mt-2.5 flex-1 text-[11px] leading-relaxed text-gray-600">{t('action.dictation')}</p>
              <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2.5">
                <Waveform className="h-5 flex-1 text-blue-500" />
                <span className="text-[10px] font-semibold tabular-nums text-gray-500">{t('action.liveTimer')}</span>
              </div>
            </div>

            {/* Arrow: rotates to point down when the columns stack */}
            <div className="flex items-center justify-center text-blue-400" aria-hidden="true">
              <svg className="h-5 w-5 rotate-90 sm:rotate-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m0 0l-5-5m5 5l-5 5" />
              </svg>
            </div>

            {/* Structured report */}
            <div className="rounded-xl border border-gray-200 bg-white p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-900">{t('action.structuredTitle')}</p>
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">
                  {t('action.structuredBadge')}
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {sections.map(([label, text]) => (
                  <div key={label} className="border-l-2 border-blue-100 pl-2">
                    <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-blue-600">{label}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-gray-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── 4. Four value points ──────────────────────────────────────────────────────
const VALUE_ICONS: IconFn[] = [iconClock, iconStethoscope, iconPhone, iconShield]

export async function ValuePoints() {
  const t = await getTranslations('landing')
  const values = t.raw('values') as Array<{ title: string; desc: string }>
  return (
    <section aria-label={t('action.heading')} className="border-t border-gray-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {values.map((v, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              {VALUE_ICONS[i]('h-4 w-4')}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{v.title}</h3>
              <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── 5. Final CTA ──────────────────────────────────────────────────────────────
export async function TrialCta() {
  const t = await getTranslations('landing')
  return (
    <section aria-labelledby="trial-heading" className="bg-blue-600">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-14 text-center md:flex-row md:justify-between md:text-left">
        <div>
          <h2 id="trial-heading" className="text-2xl font-bold tracking-tight text-white">
            {t('trial.headline')}
          </h2>
          <p className="mt-1.5 text-sm text-blue-100">{t('trial.subtext2')}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
          >
            {t('trial.primary')}
          </Link>
          <Link
            href="/signup"
            className="rounded-xl px-6 py-3 text-sm font-medium text-white ring-1 ring-inset ring-white/40 transition hover:bg-blue-500"
          >
            {t('trial.secondary')}
          </Link>
        </div>
      </div>
    </section>
  )
}
