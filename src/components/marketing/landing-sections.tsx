import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalDots, SenegalStar } from '@/components/ui/senegal-accents'
import { RadiologySliceStack } from '@/components/marketing/radiology-visual'

// Conversion-oriented landing sections. All are static, French-first, server-
// rendered marketing content — no client JS, no backend/DB/API, no tracking.
// They reuse the existing design system (rounded-2xl cards, blue-600 / emerald
// accents, Senegal accents). Decorative glyphs are aria-hidden; each section is
// a labelled landmark for assistive tech.
//
// R2.8 — icons are DECORATION, not translated content, so they moved out of
// messages/*.json and into fixed SVG here (positionally matched to each
// section's text array). Emoji glyphs (📱🔗🎙🧠✅📄📨) read as consumer-app
// styling, not the "light / clean / medical / premium / calm" direction asked
// for; a single-weight line-icon set reads calmer at any size and never
// depends on the visitor's emoji font.

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

// ── A single stroke-icon set, matching the line weight already used on the
//    Features/Security pages (strokeWidth 1.6, viewBox 0 0 24 24). ────────────
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
const iconExport: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 3.5h7l3 3v14h-10z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.5 14l2 2 3.5-3.5" />
  </svg>
)
const iconSend: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M21 3L11 13M21 3l-6.5 18-4-8-8-4L21 3z" />
  </svg>
)
const iconPhone: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6.5" y="2.5" width="11" height="19" rx="2" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M11 18.5h2" />
  </svg>
)
const iconQr: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="3.5" width="6" height="6" strokeWidth={1.6} />
    <rect x="14.5" y="3.5" width="6" height="6" strokeWidth={1.6} />
    <rect x="3.5" y="14.5" width="6" height="6" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M14.5 15h2.5v2.5M20.5 15v2M15 20.5h5.5" />
  </svg>
)
const iconComputer: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="12" rx="1.5" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M8 20.5h8M12 16.5v4" />
  </svg>
)
const iconImport: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3v11m0 0l-3.5-3.5M12 14l3.5-3.5" />
    <path strokeLinecap="round" strokeWidth={1.6} d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
)
const iconPrint: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 8.5V3.5h10V8.5" />
    <rect x="4" y="8.5" width="16" height="8" rx="1.5" strokeWidth={1.6} />
    <path strokeLinecap="round" strokeWidth={1.6} d="M7 15h10v5.5H7z" />
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
const iconShield: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.5 12l2 2 3.5-3.5" />
  </svg>
)
const iconTarget: IconFn = (c) => (
  <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" strokeWidth={1.6} />
    <circle cx="12" cy="12" r="4.5" strokeWidth={1.6} />
    <circle cx="12" cy="12" r="0.75" fill="currentColor" />
  </svg>
)

// ── Section — Results banner (sits directly above the demo) ───────────────────
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

// ── Section — the six-stage core workflow (R2.8) ───────────────────────────────
// The literal journey from src/config/product-scope.ts's CORE registry, made
// visible to a visitor: dictate → structure → review → sign → export → send.
// Anchored `#workflow` — the header's "Fonctionnement / How it works" link and
// the hero's secondary CTA both land here.
const WORKFLOW_ICONS: IconFn[] = [iconMic, iconCpu, iconEye, iconSignature, iconExport, iconSend]

export async function CoreWorkflow() {
  const t = await getTranslations('landing')
  const steps = t.raw('workflow.steps') as Array<{ label: string; desc: string }>
  return (
    <section id="workflow" aria-labelledby="workflow-heading" className="border-t border-gray-100 bg-white scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="workflow-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('workflow.title')}
          </h2>
          <p className="mt-4 text-lg text-gray-500">{t('workflow.subtitle')}</p>
        </div>

        <ol className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map((step, i) => (
            <li key={i} className="relative flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
                {WORKFLOW_ICONS[i]('h-5 w-5')}
              </span>
              <span className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-1 text-sm font-semibold text-gray-900">{step.label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{step.desc}</p>
              {i < steps.length - 1 && (
                <span
                  className="absolute right-[-14px] top-6 hidden text-gray-300 lg:block"
                  aria-hidden="true"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

// ── Section — "Conçu pour le Sénégal" (directly below the demo) ────────────────
export async function SenegalSection() {
  const t = await getTranslations('landing')
  const modalities = t.raw('senegal.modalities') as string[]
  return (
    <section aria-labelledby="senegal-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-4xl px-6 py-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          <SenegalStar className="text-[#00853F]" />
          Sénégal
        </span>
        <h2 id="senegal-heading" className="mt-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {t('senegal.title')}
        </h2>

        {/* Modalities as compact inline chips */}
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {modalities.map((m, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm font-medium text-gray-700"
            >
              <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
              {m}
            </li>
          ))}
        </ul>

        <p className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-gray-600">
          <SenegalDots />
          {t('senegal.footer')}
        </p>
      </div>
    </section>
  )
}

// ── Section — dictation modes (R2.8: computer / phone / import) ───────────────
// The phone/QR handoff is Radiora's real differentiator, and stays the most
// detailed path here — but it is now framed as ONE of three supported modes,
// not "how the whole product works" (that is now CoreWorkflow's job).
const MODE_ICONS: IconFn[] = [iconComputer, iconPhone, iconImport]
const PHONE_STEP_ICONS: IconFn[] = [iconPhone, iconQr, iconMic, iconCpu, iconEye, iconExport, iconSend]

export async function MobileDictation() {
  const t = await getTranslations('landing')
  const steps = t.raw('mobile.steps') as string[]
  const modeKeys = ['computer', 'phone', 'import'] as const

  return (
    <section aria-labelledby="mobile-heading" className="border-t border-gray-100 bg-slate-50/60">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="mobile-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('mobile.title')}
          </h2>
          <p className="mt-4 text-lg text-gray-500">{t('mobile.subtitle')}</p>
        </div>

        {/* Three modes, side by side */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {modeKeys.map((key, i) => (
            <div key={key} className="rounded-2xl border border-gray-100 bg-white p-5 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                {MODE_ICONS[i]('h-5 w-5')}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">{t(`modes.${key}.label`)}</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{t(`modes.${key}.desc`)}</p>
            </div>
          ))}
        </div>

        {/* Detailed phone flow — the differentiator */}
        <p className="mt-12 text-center text-xs font-semibold uppercase tracking-wide text-blue-600">
          {t('mobile.phoneExample')}
        </p>
        <ol className="mt-4 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-center md:gap-0">
          {steps.map((step, i) => (
            <li key={i} className="contents">
              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm md:min-h-[112px] md:w-[132px] md:flex-col md:justify-center md:gap-2 md:px-3 md:text-center">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  {PHONE_STEP_ICONS[i]('h-4 w-4')}
                </span>
                <span className="text-sm font-semibold text-gray-800">{step}</span>
              </div>
              {i < steps.length - 1 && (
                <span className="flex justify-center text-blue-300 md:px-1" aria-hidden="true">
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

// ── Section — AI assistance, conservatively worded (R2.8) ─────────────────────
// The one place this hard invariant is stated at full size on the homepage,
// not buried in a benefits grid: AI assists, the radiologist decides.
export async function AiAssistSection() {
  const t = await getTranslations('landing')
  const points = t.raw('aiAssist.points') as string[]
  return (
    <section aria-labelledby="ai-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 id="ai-heading" className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {t('aiAssist.heading')}
          </h2>
          <ul className="mt-6 space-y-3">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-gray-400">{t('aiAssist.boundary')}</p>
        </div>

        {/* The authority statement — set apart, not just another bullet. */}
        <div className="flex max-w-xs items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          {iconStethoscope('h-6 w-6 shrink-0 text-blue-600')}
          <p className="text-sm font-semibold leading-snug text-blue-900">{t('aiAssist.authority')}</p>
        </div>
      </div>
    </section>
  )
}

// ── Section — report output (R2.8) ──────────────────────────────────────────────
const OUTPUT_ICONS: IconFn[] = [iconExport, iconExport, iconPrint, iconSend]

export async function ReportOutputSection() {
  const t = await getTranslations('landing')
  const items = t.raw('output.items') as Array<{ label: string; desc: string }>
  return (
    <section aria-labelledby="output-heading" className="border-t border-gray-100 bg-slate-50/60">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 id="output-heading" className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {t('output.heading')}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {OUTPUT_ICONS[i]('h-4.5 w-4.5')}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">{item.label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section — trust strip (R2.8) — factual claims only, links to /security ────
export async function TrustStripSection() {
  const t = await getTranslations('landing')
  const points = t.raw('trustStrip.points') as string[]
  return (
    <section aria-labelledby="trust-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          {iconShield('h-8 w-8 text-emerald-600')}
          <h2 id="trust-heading" className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            {t('trustStrip.heading')}
          </h2>
        </div>
        <ul className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl bg-emerald-50/50 px-4 py-3 text-sm text-gray-700">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center">
          <Link href="/security" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            {t('trustStrip.link')} →
          </Link>
        </p>
      </div>
    </section>
  )
}

// ── Section — Pilot program testimonial ─────────────────────────────────────────
export async function PilotTestimonial() {
  const t = await getTranslations('landing')
  return (
    <section aria-labelledby="testimonial-heading" className="border-t border-gray-100 bg-slate-50/60">
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

// ── Section — "Pourquoi Radiora" — the single benefits section ────────────────
// One unified value-proposition grid (six cards). Merges the former highlights
// grid and the second "why" section into a single, scannable block.
interface WhyTheme {
  title: string
  desc: string
}

const WHY_ICONS: IconFn[] = [iconClock, iconStethoscope, iconPhone, iconShield, iconTarget, () => (
  <SenegalStar className="h-5 w-5 text-[#00853F]" />
)]

export async function WhyRadiora() {
  const t = await getTranslations('landing')
  const themes = t.raw('why.themes') as WhyTheme[]
  return (
    <section aria-labelledby="why-heading" className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="why-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('why.heading')}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-500">{t('why.subtitle')}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                {WHY_ICONS[i]('h-5 w-5')}
              </span>
              <h3 className="mt-4 text-base font-semibold text-gray-900">{theme.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{theme.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section — Final CTA (R2.8: sign-in first, trial kept as the real
//    secondary path — never removed, since it is working infrastructure). ─────
export async function TrialCta() {
  const t = await getTranslations('landing')
  return (
    <section aria-labelledby="trial-heading" className="bg-blue-600">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <div className="mx-auto mb-6 w-24 text-blue-200/70">
          <RadiologySliceStack className="w-full" />
        </div>
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
            href="/login"
            className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
          >
            {t('trial.primary')}
          </Link>
          <Link
            href="/signup"
            className="rounded-xl px-6 py-3.5 text-sm font-medium text-white ring-1 ring-inset ring-white/40 transition hover:bg-blue-500"
          >
            {t('trial.secondary')}
          </Link>
        </div>
      </div>
    </section>
  )
}
