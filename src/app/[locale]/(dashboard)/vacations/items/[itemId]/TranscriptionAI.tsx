import { getTranslations } from 'next-intl/server'

// Presentation Screen 5 (slide 8) — explains and frames the EXISTING AI engine.
// Purely informational: the live raw/cleaned/structured/confidence/correction
// data is rendered by StructuringReview (F7). No AI logic or backend here.
export async function TranscriptionAI() {
  const t = await getTranslations('structuring')

  const steps = [
    { key: 'pAudio',        color: 'bg-slate-100 text-slate-600' },
    { key: 'pRaw',          color: 'bg-blue-50 text-blue-600' },
    { key: 'pCorrection',   color: 'bg-indigo-50 text-indigo-600' },
    { key: 'pStructuring',  color: 'bg-violet-50 text-violet-600' },
    { key: 'pConfidence',   color: 'bg-amber-50 text-amber-700' },
    { key: 'pValidation',   color: 'bg-emerald-50 text-emerald-700' },
  ] as const

  const capabilities = [
    {
      titleKey: 'capStyleTitle', descKey: 'capStyleDesc', accent: 'text-blue-600 bg-blue-50',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
    },
    {
      titleKey: 'capModelTitle', descKey: 'capModelDesc', accent: 'text-violet-600 bg-violet-50',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    },
    {
      titleKey: 'capDetectTitle', descKey: 'capDetectDesc', accent: 'text-amber-600 bg-amber-50',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />,
    },
    {
      titleKey: 'capLearnTitle', descKey: 'capLearnDesc', accent: 'text-emerald-600 bg-emerald-50',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
    },
  ] as const

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t('aiTitle')}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{t('aiSubtitle')}</p>
      </div>

      {/* Visual pipeline */}
      <ol className="mt-5 flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-center gap-2 lg:flex-1 lg:flex-col lg:gap-2">
            <div className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 ${step.color}`}>
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-semibold">
                {i + 1}
              </span>
              <span className="text-sm font-medium">{t(step.key)}</span>
            </div>
            {i < steps.length - 1 && (
              <span className="flex-shrink-0 px-1 text-gray-300" aria-hidden="true">
                <svg className="h-4 w-4 lg:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <svg className="hidden h-4 w-4 lg:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Four expert-validated capabilities */}
      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t('capabilitiesHeading')}
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {capabilities.map((c) => (
          <div key={c.titleKey} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${c.accent}`}>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{c.icon}</svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{t(c.titleKey)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{t(c.descKey)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* AI assists, radiologist validates */}
      <div className="mt-5 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <svg className="h-5 w-5 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium text-blue-800">{t('aiNote')}</p>
      </div>
    </section>
  )
}
