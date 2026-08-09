'use client'

import { useState, useEffect, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { generateHPDDraft, acceptHPDDraft, rejectAiOutput, type HpdStructuringMeta } from '@/lib/actions/ai'
import type { StructuredReportData } from '@/types/report'

interface Props {
  reportId:     string
  modality:     string | null
  bodyPart:     string | null
  onAccept:     (data: StructuredReportData) => void
  voiceSignal?: { text: string; key: number } | null
}

type Phase = 'idle' | 'reviewing'

interface PanelState {
  phase:  Phase
  output: StructuredReportData | null
  jobId:  string | null
  error:  string | null
  /** R2.0 — safety metadata from the canonical pipeline. */
  meta:   HpdStructuringMeta | null
}

const IDLE: PanelState = { phase: 'idle', output: null, jobId: null, error: null, meta: null }

// ─── Section preview ─────────────────────────────────────────────────────────

function SectionPreview({ label, content, empty }: { label: string; content: string; empty?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase">{label}</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      {content ? (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {content}
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">{empty ?? '—'}</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SmartStructuringPanel({ reportId, modality, bodyPart, onAccept, voiceSignal }: Props) {
  const t = useTranslations('smartStructuring')
  // Reuses the queue review panel's vocabulary — the same engine metadata is
  // being described, so no new i18n keys are introduced.
  const ts = useTranslations('structuring')

  const [open,     setOpen]     = useState(false)
  const [freeText, setFreeText] = useState('')
  const [state,    setState]    = useState<PanelState>(IDLE)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!voiceSignal) return
    setFreeText(voiceSignal.text)
    setState(IDLE)
    setOpen(true)
  }, [voiceSignal])

  function handleGenerate() {
    startTransition(async () => {
      setState(IDLE)
      const result = await generateHPDDraft(reportId, freeText, modality, bodyPart)
      if (result.error || !result.jobId || !result.output) {
        setState({ ...IDLE, error: result.error ?? 'Unknown error.' })
      } else {
        setState({
          phase: 'reviewing',
          output: result.output,
          jobId: result.jobId,
          error: null,
          meta: result.structuring ?? null,
        })
      }
    })
  }

  function handleAccept() {
    if (!state.jobId || !state.output) return
    const draft = state.output
    startTransition(async () => {
      const result = await acceptHPDDraft(state.jobId!, reportId, draft)
      if (result.error) {
        setState((s) => ({ ...s, error: result.error }))
      } else {
        onAccept(draft)
        setState(IDLE)
        setFreeText('')
        setOpen(false)
      }
    })
  }

  function handleReject() {
    if (!state.jobId) return
    startTransition(async () => {
      await rejectAiOutput(state.jobId!, reportId)
      setState(IDLE)
    })
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">

      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-indigo-50/80 transition"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="text-sm font-semibold text-indigo-900">{t('title')}</span>
          <span className="text-xs text-indigo-500 bg-indigo-100 rounded-full px-2 py-0.5 font-medium">
            {t('badge')}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-indigo-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-indigo-200 px-5 py-4 space-y-4">

          {/* Safety disclaimer */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            {t('disclaimer')}
          </div>

          {/* ── Idle: input form ── */}
          {state.phase === 'idle' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="ai-free-text">
                  {t('pasteNotes')}
                </label>
                <textarea
                  id="ai-free-text"
                  rows={5}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  disabled={isPending}
                  placeholder={modality ? t('placeholder', { modality }) : t('placeholderGeneric')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 resize-y"
                />
              </div>

              {state.error && (
                <p className="text-xs text-red-600">{state.error}</p>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!freeText.trim() || isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    {t('structuring')}
                  </>
                ) : t('structureNotes')}
              </button>
            </>
          )}

          {/* ── Reviewing: HPD-format preview ── */}
          {state.phase === 'reviewing' && state.output && (
            <>
              {/* Exam title */}
              <div className="rounded-lg bg-slate-800 text-white px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-0.5">
                  {t('examTitle')}
                </p>
                <p className="text-sm font-bold tracking-wide">{state.output.examTitle}</p>
              </div>

              <p className="text-xs text-gray-500">{t('reviewBelow')}</p>

              <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                <SectionPreview
                  label={t('sectionIndication')}
                  content={state.output.indication}
                  empty={t('noneDetected')}
                />
                <SectionPreview
                  label={t('sectionTechnique')}
                  content={state.output.technique}
                  empty={t('noneDetected')}
                />
                <SectionPreview
                  label={t('sectionResults')}
                  content={state.output.results}
                  empty={t('noneDetected')}
                />
                <SectionPreview
                  label={t('sectionConclusion')}
                  content={state.output.conclusion}
                  empty={t('noneDetected')}
                />
                {state.output.recommendations && (
                  <SectionPreview
                    label={t('sectionRecommendations')}
                    content={state.output.recommendations}
                  />
                )}
              </div>

              {/* R2.0 — safety metadata from the canonical pipeline. Surfaced
                  here so the radiologist sees what the engine changed and what
                  still needs confirmation, rather than it being discarded. */}
              {state.meta && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {state.meta.reviewRequired && (
                    <p className="text-xs font-semibold text-amber-700">
                      ⚠ {ts('reviewRequired')}
                    </p>
                  )}

                  {state.meta.confidence.some((c) => c.autoFilled) && (
                    <p className="text-[11px] text-amber-700">
                      {ts('autoFilled')}
                    </p>
                  )}

                  {state.meta.correctionEvents.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {ts('corrections')}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {state.meta.correctionEvents.map((e, i) => (
                          <li key={i} className="text-[11px] text-gray-600">
                            <span className="rounded bg-gray-200 px-1 font-mono text-[10px] text-gray-700">
                              {e.marker}
                            </span>{' '}
                            {e.applied === false ? (
                              // Preserved, not applied — a review suggestion.
                              <span className="text-amber-700">{e.removed || '—'}</span>
                            ) : (
                              <>
                                <span className="text-red-500 line-through">{e.removed || '—'}</span>
                                {' → '}
                                <span className="text-green-700">{e.kept}</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {state.meta.removedTokens.length > 0 && (
                    <p className="text-[11px] text-gray-500">
                      {ts('removed')}: {state.meta.removedTokens.length}
                    </p>
                  )}
                </div>
              )}

              {state.error && (
                <p className="text-xs text-red-600">{state.error}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button" onClick={handleAccept} disabled={isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-lg transition"
                >
                  {isPending ? t('applying') : t('acceptAndApply')}
                </button>
                <button
                  type="button" onClick={handleReject} disabled={isPending}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition"
                >
                  {t('reject')}
                </button>
                <button
                  type="button" onClick={() => setState(IDLE)} disabled={isPending}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  {t('startOver')}
                </button>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  )
}
