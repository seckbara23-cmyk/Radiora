'use client'

import { useState, useActionState } from 'react'
import { handleReportForm } from '@/lib/actions/reports'
import type { Report } from '@/types/report'
import type { Template } from '@/types/template'

const textareaCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'
const selectCls =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'

interface Props {
  report: Report
  canWrite: boolean   // clinic_admin | super_admin | radiologist
  canAmend: boolean   // clinic_admin | super_admin | radiologist
  templates: Template[]
}

export function ReportEditor({ report, canWrite, canAmend, templates }: Props) {
  const isFinalized = report.status === 'finalized'
  const isEditable  = !isFinalized && canWrite

  // Controlled fields so template application works without a form reset
  const [findings,        setFindings]        = useState(report.findings)
  const [impression,      setImpression]      = useState(report.impression)
  const [recommendations, setRecommendations] = useState(report.recommendations ?? '')

  // Template selector
  const [selectedTpl, setSelectedTpl] = useState('')

  // Amend flow
  const [showAmendPanel, setShowAmendPanel] = useState(false)
  const [changeReason,   setChangeReason]   = useState('')

  const [state, formAction, isPending] = useActionState(handleReportForm, { error: null })

  function applyTemplate() {
    const tpl = templates.find((t) => t.id === selectedTpl)
    if (!tpl) return
    setFindings(tpl.findingsTemplate)
    setImpression(tpl.impressionTemplate)
    setRecommendations(tpl.recommendationsTemplate)
    setSelectedTpl('')
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id"       value={report.id} />
      <input type="hidden" name="study_id" value={report.studyId} />

      {/* ── Template selector ─────────────────────────────────────── */}
      {isEditable && templates.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedTpl}
            onChange={(e) => setSelectedTpl(e.target.value)}
            disabled={isPending}
            className={selectCls}
          >
            <option value="">Apply a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}{t.modality ? ` (${t.modality})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyTemplate}
            disabled={!selectedTpl || isPending}
            className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 rounded-lg transition"
          >
            Apply
          </button>
        </div>
      )}

      {/* ── Main editor ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        <div>
          <label className={labelCls} htmlFor="findings">Findings *</label>
          <textarea
            id="findings" name="findings" rows={8}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            disabled={isPending || !isEditable}
            placeholder="Describe the imaging findings in detail…"
            className={textareaCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="impression">Impression *</label>
          <textarea
            id="impression" name="impression" rows={4}
            value={impression}
            onChange={(e) => setImpression(e.target.value)}
            disabled={isPending || !isEditable}
            placeholder="Summarize the key diagnostic impression…"
            className={textareaCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="recommendations">Recommendations</label>
          <textarea
            id="recommendations" name="recommendations" rows={3}
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            disabled={isPending || !isEditable}
            placeholder="Follow-up recommendations (optional)…"
            className={textareaCls}
          />
        </div>

      </div>

      {/* ── Amendment reason panel ────────────────────────────────── */}
      {showAmendPanel && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Amend Finalized Report</p>
            <p className="text-xs text-amber-700 mt-0.5">
              A reason is required. The finalized content will be preserved as a version snapshot before re-opening.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1.5" htmlFor="change_reason">
              Reason for Amendment *
            </label>
            <textarea
              id="change_reason"
              name="change_reason"
              rows={2}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. Correcting measurement error in right lung nodule…"
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              name="_submit"
              value="amend"
              disabled={!changeReason.trim() || isPending}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Opening…' : 'Confirm Amendment'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAmendPanel(false); setChangeReason('') }}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Finalization notice ───────────────────────────────────── */}
      {isFinalized && report.signedAt && !showAmendPanel && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Report finalized and signed on {report.signedAt.slice(0, 10)}.
          {canAmend && ' Use "Amend Report" to re-open for editing.'}
        </div>
      )}

      {/* ── Error / saved feedback ────────────────────────────────── */}
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.saved && !state.error && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Draft saved.
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-gray-100">
        {isFinalized ? (
          canAmend && !showAmendPanel && (
            <button
              type="button"
              onClick={() => setShowAmendPanel(true)}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition"
            >
              Amend Report
            </button>
          )
        ) : (
          <>
            {/* Disabled AI Draft button — placeholder for future phase */}
            <button
              type="button"
              disabled
              title="AI assistance will be available in a future release. Reports must always be reviewed and finalized by a clinician."
              className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed select-none flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Generate AI Draft
            </button>

            <button
              type="submit"
              name="_submit"
              value="save"
              disabled={isPending || !canWrite}
              className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="submit"
              name="_submit"
              value="finalize"
              disabled={isPending || !canWrite}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Finalizing…' : 'Finalize Report'}
            </button>
          </>
        )}
      </div>

      {/* Disclaimer under AI button */}
      {!isFinalized && (
        <p className="text-xs text-gray-400 text-right">
          Reports must always be reviewed and finalized by a licensed clinician.
        </p>
      )}
    </form>
  )
}
