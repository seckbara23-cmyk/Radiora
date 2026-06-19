'use client'

// Public landing-page interactive AI demo.
//
// SAFETY / COMPLIANCE (see also lib/demo/demo-structuring.ts):
//   • 100 % client-side. Runs the PURE Feature-7 pipeline (runDemo) in the
//     browser — no network call, no server action, no database, no external AI.
//   • Nothing the visitor types is persisted or transmitted. There is no login.
//   • Sample patient identities are FICTIONAL demo metadata; free-text input is
//     never echoed as a named patient (the preview shows placeholders instead).
//   • The demo never lets a visitor create a real clinical report — it only
//     renders an illustrative preview and always shows the validation disclaimer.

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { DEMO_SAMPLES } from '@/lib/demo/demo-samples'
import { runDemo, type DemoResult } from '@/lib/demo/demo-structuring'

type Mode = 'sample' | 'custom'

const TYPE_INTERVAL_MS = 16
const TYPE_CHARS_PER_TICK = 3

export function RadioraDemo() {
  const t = useTranslations('demo')
  const locale = useLocale()

  // Default to the first sample, computed deterministically (safe for SSR).
  const [sampleId, setSampleId] = useState<string>(DEMO_SAMPLES[0].id)
  const [mode, setMode] = useState<Mode>('sample')
  const [result, setResult] = useState<DemoResult>(() => {
    const s = DEMO_SAMPLES[0]
    return runDemo(s.dictation, s.patient)
  })

  // Animation state. `revealed` gates how many workflow panels are visible:
  // 0 = dictation only, 1 = transcribing, 2 = +correction, 3 = +structuring, 4 = +report.
  const [revealed, setRevealed] = useState(0)
  const [typed, setTyped] = useState('')
  const [input, setInput] = useState('')

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  // Client-only illustrative date (avoids SSR hydration mismatch).
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR'))
  }, [locale])

  function loadSample(id: string) {
    clearTimers()
    const s = DEMO_SAMPLES.find((x) => x.id === id) ?? DEMO_SAMPLES[0]
    setSampleId(s.id)
    setMode('sample')
    setResult(runDemo(s.dictation, s.patient))
    setRevealed(0)
    setTyped('')
  }

  // Progressive "voice transcription" typing, then auto-reveal of the rest.
  useEffect(() => {
    if (revealed !== 1) return
    const full = result.raw
    if (!full) {
      setRevealed(4)
      return
    }
    let i = 0
    const id = setInterval(() => {
      i += TYPE_CHARS_PER_TICK
      setTyped(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(id)
        timers.current.push(
          setTimeout(() => setRevealed(2), 450),
          setTimeout(() => setRevealed(3), 1100),
          setTimeout(() => setRevealed(4), 1750),
        )
      }
    }, TYPE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [revealed, result])

  function simulate() {
    clearTimers()
    setTyped('')
    setRevealed(1)
  }

  function structureCustom() {
    clearTimers()
    const text = input.trim()
    if (!text) return
    // Free text → NO patient metadata (never echo visitor identity as a patient).
    const r = runDemo(text)
    setMode('custom')
    setResult(r)
    setTyped(r.raw)
    setRevealed(4)
  }

  const activeStep = revealed <= 1 ? 0 : revealed === 2 ? 1 : revealed === 3 ? 2 : 3
  const stepLabels = [t('steps.dictee'), t('steps.correction'), t('steps.structuration'), t('steps.validation')]

  return (
    <div className="mx-auto max-w-5xl">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('sectionTitle')}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-500">{t('subtitle')}</p>
        <p className="mt-5 text-base font-semibold text-blue-600">{t('tagline')}</p>
      </div>

      {/* 4-step indicator */}
      <ol className="mx-auto mt-10 flex max-w-2xl items-center justify-between">
        {stepLabels.map((label, i) => {
          const done = i < activeStep
          const active = i === activeStep
          return (
            <li key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <span
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400',
                  ].join(' ')}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={['text-xs font-medium', active || done ? 'text-gray-900' : 'text-gray-400'].join(' ')}>
                  {label}
                </span>
              </div>
              {i < stepLabels.length - 1 && (
                <span className={['mx-2 h-0.5 flex-1 rounded', i < activeStep ? 'bg-emerald-400' : 'bg-gray-100'].join(' ')} />
              )}
            </li>
          )
        })}
      </ol>

      {/* Sample chooser */}
      <div className="mt-10">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">{t('examplesHeading')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {DEMO_SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => loadSample(s.id)}
              className={[
                'rounded-full border px-4 py-2 text-sm font-medium transition',
                mode === 'sample' && sampleId === s.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              {t(`sample.${s.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* ── Left column: workflow steps ── */}
        <div className="space-y-5">
          {/* Step 1 — raw dictation */}
          <StepCard n={1} title={t('step1Title')} hint={t('step1Hint')}>
            <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700">{result.raw}</p>
            <button
              type="button"
              onClick={simulate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              {revealed === 0 ? t('simulateBtn') : t('replayBtn')}
            </button>
          </StepCard>

          {/* Step 2 — transcription */}
          {revealed >= 1 && (
            <StepCard n={2} title={t('step2Title')} hint={t('step2Hint')}>
              <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800">
                {typed}
                {revealed === 1 && typed.length < result.raw.length && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-blue-500 align-middle" />
                )}
              </p>
            </StepCard>
          )}

          {/* Step 3 — smart correction */}
          {revealed >= 2 && (
            <StepCard n={3} title={t('step3Title')} hint={t('step3Explain')}>
              {result.corrections.length > 0 ? (
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {t('step3Badge')}
                  </span>
                  {result.corrections.map((c, i) => (
                    <div key={i} className="space-y-1.5 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-14 shrink-0 text-xs font-semibold uppercase text-gray-400">{t('beforeLabel')}</span>
                        <span className="text-red-600 line-through decoration-red-300">{c.removed}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-14 shrink-0 text-xs font-semibold uppercase text-gray-400">{t('afterLabel')}</span>
                        <span className="font-medium text-emerald-700">{c.kept}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{t('noCorrection')}</p>
              )}
            </StepCard>
          )}

          {/* Step 4 — structuring */}
          {revealed >= 3 && (
            <StepCard n={4} title={t('step4Title')} hint={t('step4Hint')}>
              <dl className="space-y-3">
                {result.sections.map((s) => (
                  <div key={s.key}>
                    <dt className="text-xs font-bold uppercase tracking-wide text-blue-600">{s.label}</dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-gray-700">{s.body}</dd>
                  </div>
                ))}
              </dl>
              {result.removedTokens.length > 0 && (
                <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
                  {t('beforeLabel')}: {result.removedTokens.map((r) => `« ${r.text} »`).join(', ')}
                </p>
              )}
            </StepCard>
          )}
        </div>

        {/* ── Right column: report preview ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          {revealed >= 4 ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t('step5Title')}
              </div>
              <div className="p-6" style={{ fontFamily: "'Times New Roman', serif", color: '#111' }}>
                {/* header bar */}
                <div className="border-b-2 border-gray-900 pb-2">
                  <div className="text-[13px] font-bold uppercase tracking-wide text-gray-400">{t('reportHeaderPlaceholder')}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">{t('reportDeptName')}</div>
                </div>

                {/* patient box */}
                <div className="my-3 grid grid-cols-2 gap-x-4 gap-y-1 border border-gray-400 px-3 py-2 text-[11px]">
                  <Field label={t('patientLabel')} value={result.patient.name} />
                  <Field label={t('dateLabel')} value={today || '—'} />
                  <Field label={t('ageLabel')} value={result.patient.age} />
                  <Field label={t('sexLabel')} value={result.patient.sex} />
                </div>

                {/* exam title */}
                <div className="my-4 text-center text-[15px] font-bold uppercase tracking-wider underline">{result.examTitle}</div>

                {/* sections */}
                <div className="space-y-3">
                  {result.sections.map((s) => (
                    <div key={s.key}>
                      <div className="text-[11px] font-bold underline">{s.label} :</div>
                      <div className="mt-0.5 whitespace-pre-wrap text-justify text-[11px] leading-relaxed">{s.body}</div>
                    </div>
                  ))}
                </div>

                {/* signature */}
                <div className="mt-8 text-right text-[11px]">
                  <div className="font-bold">{t('signatureLabel')}</div>
                  <div className="text-gray-500">{t('signaturePlaceholder')}</div>
                </div>
              </div>

              <div className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-center text-[11px] font-medium text-amber-700">
                {t('reviewRequired')}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center">
              <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-4 max-w-xs text-sm text-gray-400">{t('step5Title')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Interactive free-text ── */}
      <div className="mt-12 rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-50 to-blue-50/50 p-6 sm:p-8">
        <h3 className="text-lg font-semibold text-gray-900">{t('tryHeading')}</h3>
        <p className="mt-1 text-sm text-gray-500">{t('tryHint')}</p>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" />
          </svg>
          {t('phiWarning')}
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder={t('placeholder')}
          className="mt-4 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={structureCustom}
            disabled={!input.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('structureBtn')}
          </button>
          <span className="text-xs text-gray-400">{t('noStore')}</span>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="mt-12 rounded-2xl bg-blue-600 px-6 py-10 text-center sm:px-10">
        <h3 className="text-2xl font-bold tracking-tight text-white">{t('ctaHeading')}</h3>
        <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
          >
            {t('ctaTrial')}
          </Link>
          <Link
            href="/contact"
            className="rounded-xl px-6 py-3.5 text-sm font-medium text-white ring-1 ring-inset ring-white/40 transition hover:bg-blue-500"
          >
            {t('ctaDemo')}
          </Link>
        </div>
      </div>

      {/* Compliance footer */}
      <p className="mt-8 text-center text-xs leading-relaxed text-gray-400">{t('disclaimer')}</p>
    </div>
  )
}

function StepCard({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{hint}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="font-bold">{label} :</span>
      <span>{value}</span>
    </div>
  )
}
