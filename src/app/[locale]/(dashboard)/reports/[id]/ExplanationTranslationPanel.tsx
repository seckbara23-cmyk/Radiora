'use client'

import { useState, useTransition } from 'react'
import {
  generateExplanationTranslation,
  approveTranslation,
  rejectTranslation,
  regenerateExplanationTranslation,
} from '@/lib/actions/translations'
import type { ReportTranslation } from '@/lib/data/translations'

const STATUS_BADGE: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-700 ring-gray-500/20',
  approved: 'bg-green-50 text-green-700 ring-green-600/20',
  rejected: 'bg-red-50 text-red-700 ring-red-600/20',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

interface Props {
  explanationId:       string
  reportId:            string
  sourceExplanation:   string
  sourceDisclaimer:    string
  initialTranslation:  ReportTranslation | null
}

const textareaCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:bg-gray-50 resize-y'

const readonlyCls =
  'rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed min-h-[4rem]'

export function ExplanationTranslationPanel({
  explanationId, reportId, sourceExplanation, sourceDisclaimer, initialTranslation,
}: Props) {
  const [translation,   setTranslation]   = useState(initialTranslation)
  const [editText,      setEditText]      = useState(initialTranslation?.translatedExplanation ?? '')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason,  setRejectReason]  = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [isPending, startTransition]      = useTransition()

  const status = translation?.status ?? null

  function resetRejectForm() {
    setShowRejectForm(false)
    setRejectReason('')
  }

  function syncFromTranslation(t: ReportTranslation) {
    setTranslation(t)
    setEditText(t.translatedExplanation ?? '')
    resetRejectForm()
    setError(null)
  }

  function handleGenerate() {
    startTransition(async () => {
      setError(null)
      const result = await generateExplanationTranslation(explanationId, reportId, 'fr')
      if (result.error) setError(result.error)
      else syncFromTranslation(result.translation!)
    })
  }

  function handleApprove() {
    if (!translation) return
    startTransition(async () => {
      setError(null)
      const result = await approveTranslation(translation.id, reportId, { explanation: editText })
      if (result.error) setError(result.error)
      else setTranslation(result.translation!)
    })
  }

  function handleConfirmReject() {
    if (!translation || !rejectReason.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await rejectTranslation(translation.id, reportId, rejectReason)
      if (result.error) setError(result.error)
      else { setTranslation(result.translation!); resetRejectForm() }
    })
  }

  function handleRegenerate() {
    if (!translation) return
    if (!window.confirm('Regenerate translation? The current draft will be archived.')) return
    startTransition(async () => {
      setError(null)
      const result = await regenerateExplanationTranslation(
        translation.id, explanationId, reportId, 'fr',
      )
      if (result.error) setError(result.error)
      else syncFromTranslation(result.translation!)
    })
  }

  const spinnerSvg = (
    <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )

  return (
    <section className="space-y-3">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Patient Explanation Translation
          </h2>
          <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 font-medium">
            EN → FR
          </span>
          <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
            Local Demo
          </span>
        </div>
        {status && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status] ?? STATUS_BADGE.draft}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-violet-200 bg-white overflow-hidden">

        {/* ── Clinician warning ─────────────────────────────────────────── */}
        <div className="border-b border-violet-100 bg-violet-50/60 px-4 py-2.5 flex items-center gap-2 text-xs text-violet-800">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          Translations must be reviewed by a clinician before use. Local engine — not a professional translation.
        </div>

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!status && (
          <div className="px-6 py-10 text-center space-y-4">
            <p className="text-sm text-gray-500">No French translation of the patient explanation yet.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="mx-auto flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? <>{spinnerSvg} Generating…</> : 'Translate to French'}
            </button>
          </div>
        )}

        {/* ── Draft & Approved: side-by-side ───────────────────────────── */}
        {(status === 'draft' || status === 'approved') && translation && (
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-1 md:grid-cols-2 border-b border-gray-100">
              <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 md:border-r border-gray-100">
                Original (English)
              </div>
              <div className="px-4 py-2.5 text-xs font-semibold text-violet-700 bg-violet-50/40">
                Translation (French)
                {status === 'draft' && (
                  <span className="ml-2 font-normal text-gray-400">— editable</span>
                )}
              </div>
            </div>

            {/* Explanation text */}
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="px-4 py-4 md:border-r border-gray-100 space-y-2">
                <div className={readonlyCls}>{sourceExplanation}</div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 italic">
                  {sourceDisclaimer}
                </div>
              </div>
              <div className="px-4 py-4 space-y-2">
                {status === 'draft' ? (
                  <>
                    <textarea
                      rows={9}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      disabled={isPending}
                      className={textareaCls}
                    />
                    <div className="rounded-md bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs text-violet-700 italic">
                      {translation.disclaimer}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={readonlyCls}>{translation.translatedExplanation}</div>
                    {translation.disclaimer && (
                      <div className="rounded-md bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs text-violet-700 italic">
                        {translation.disclaimer}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Action area ──────────────────────────────────────────── */}
            <div className="border-t border-gray-100 px-4 py-4 space-y-3">
              {status === 'approved' && translation.approvedAt && (
                <p className="text-xs text-gray-400">
                  Approved {formatDateTime(translation.approvedAt)}
                </p>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              {status === 'draft' && !showRejectForm && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={!editText.trim() || isPending}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold rounded-lg transition"
                  >
                    {isPending ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isPending}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={isPending}
                    className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
                  >
                    Regenerate
                  </button>
                </div>
              )}

              {status === 'draft' && showRejectForm && (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-900">Reason for rejection *</p>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    disabled={isPending}
                    placeholder="e.g. Translation misses key phrases."
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmReject}
                      disabled={!rejectReason.trim() || isPending}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition"
                    >
                      {isPending ? 'Rejecting…' : 'Confirm Rejection'}
                    </button>
                    <button
                      type="button"
                      onClick={resetRejectForm}
                      disabled={isPending}
                      className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {status === 'approved' && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isPending}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
                >
                  {isPending ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Rejected state ────────────────────────────────────────────── */}
        {status === 'rejected' && translation && (
          <div className="p-5 space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800">
              <span className="font-semibold">Rejected.</span>
              {translation.rejectionReason && <span> Reason: {translation.rejectionReason}</span>}
            </div>
            {translation.rejectedAt && (
              <p className="text-xs text-gray-400">Rejected {formatDateTime(translation.rejectedAt)}</p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? <>{spinnerSvg} Regenerating…</> : 'Generate New Translation'}
            </button>
          </div>
        )}

      </div>
    </section>
  )
}
