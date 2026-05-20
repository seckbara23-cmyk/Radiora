'use client'

import { useState, useTransition } from 'react'
import { generateStructuredDraft, acceptAiOutput, rejectAiOutput } from '@/lib/actions/ai'
import type { StructuredDraft } from '@/lib/ai/mock-engine'

interface Props {
  reportId: string
  modality: string | null
  bodyPart: string | null
  onAccept: (draft: StructuredDraft) => void
}

type Phase = 'idle' | 'reviewing'

interface PanelState {
  phase: Phase
  output: StructuredDraft | null
  jobId: string | null
  error: string | null
}

const IDLE: PanelState = { phase: 'idle', output: null, jobId: null, error: null }

const previewFieldCls =
  'w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap min-h-[3rem]'

export function SmartStructuringPanel({ reportId, modality, bodyPart, onAccept }: Props) {
  const [open, setOpen]         = useState(false)
  const [freeText, setFreeText] = useState('')
  const [state, setState]       = useState<PanelState>(IDLE)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    startTransition(async () => {
      setState(IDLE)
      const result = await generateStructuredDraft(reportId, freeText, modality, bodyPart)
      if (result.error || !result.jobId || !result.output) {
        setState({ ...IDLE, error: result.error ?? 'Unknown error.' })
      } else {
        setState({ phase: 'reviewing', output: result.output, jobId: result.jobId, error: null })
      }
    })
  }

  function handleAccept() {
    if (!state.jobId || !state.output) return
    const draft = state.output
    startTransition(async () => {
      const result = await acceptAiOutput(state.jobId!, reportId)
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

  function handleReset() {
    setState(IDLE)
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
          <span className="text-sm font-semibold text-indigo-900">Smart Structuring</span>
          <span className="text-xs text-indigo-500 bg-indigo-100 rounded-full px-2 py-0.5 font-medium">
            Local Demo
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

          {/* Disclaimer */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <span className="font-semibold">Clinician review required.</span> This tool uses a local
            structuring engine with no external AI connections. All output must be reviewed, edited,
            and finalized by a licensed clinician before use. AI suggestions are never auto-applied.
          </div>

          {state.phase === 'idle' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="ai-free-text">
                  Paste or type unstructured notes
                </label>
                <textarea
                  id="ai-free-text"
                  rows={5}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  disabled={isPending}
                  placeholder={
                    modality
                      ? `e.g. ${modality} findings, clinical indication, impression…`
                      : 'Paste free-text clinical notes here…'
                  }
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
                    Structuring…
                  </>
                ) : 'Structure Notes'}
              </button>
            </>
          )}

          {state.phase === 'reviewing' && state.output && (
            <>
              <p className="text-xs text-gray-500">
                Review the structured output below. Accept to apply Findings, Impression, and
                Recommendations to the editor — or Reject to discard.
              </p>

              <div className="space-y-3">
                {state.output.clinicalIndication && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Clinical Indication</p>
                    <div className={previewFieldCls}>{state.output.clinicalIndication}</div>
                  </div>
                )}
                {state.output.technique && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Technique</p>
                    <div className={previewFieldCls}>{state.output.technique}</div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Findings</p>
                  <div className={previewFieldCls}>{state.output.findings || <span className="text-gray-400 italic">None detected</span>}</div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Impression</p>
                  <div className={previewFieldCls}>{state.output.impression || <span className="text-gray-400 italic">None detected</span>}</div>
                </div>
                {state.output.recommendations && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Recommendations</p>
                    <div className={previewFieldCls}>{state.output.recommendations}</div>
                  </div>
                )}
              </div>

              {(state.output.clinicalIndication || state.output.technique) && (
                <p className="text-xs text-gray-400 italic">
                  Clinical Indication and Technique are shown for reference only and will not be
                  written to the report fields.
                </p>
              )}

              {state.error && (
                <p className="text-xs text-red-600">{state.error}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-lg transition"
                >
                  {isPending ? 'Applying…' : 'Accept & Apply'}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isPending}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPending}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  Start over
                </button>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  )
}
