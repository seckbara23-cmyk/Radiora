import { getTranslations } from 'next-intl/server'

// Presentation Screen 4 (slide 8) — the automatic processing pipeline, shown
// visually. Purely informational: it mirrors the existing vacation workflow
// statuses (audio_received → … → validated) and triggers no backend work.
export async function TranscriptionPipeline() {
  const t = await getTranslations('vacationQueue')

  const steps = [
    { key: 'pipelineAudio',        color: 'bg-slate-100 text-slate-600' },
    { key: 'pipelineTranscription', color: 'bg-blue-50 text-blue-600' },
    { key: 'pipelineCorrection',   color: 'bg-indigo-50 text-indigo-600' },
    { key: 'pipelineStructuring',  color: 'bg-violet-50 text-violet-600' },
    { key: 'pipelineValidation',   color: 'bg-emerald-50 text-emerald-700' },
  ] as const

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-gray-900">{t('pipelineHeading')}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{t('pipelineSubtitle')}</p>

      <ol className="mt-5 flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-center gap-2 md:flex-1 md:flex-col md:gap-2">
            <div className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 ${step.color}`}>
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-semibold">
                {i + 1}
              </span>
              <span className="text-sm font-medium">{t(step.key)}</span>
            </div>
            {i < steps.length - 1 && (
              <span className="flex-shrink-0 px-1 text-gray-300" aria-hidden="true">
                {/* down on mobile, right on desktop */}
                <svg className="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <svg className="hidden h-4 w-4 md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
