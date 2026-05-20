'use client'

import { useState, useTransition } from 'react'
import {
  generatePatientExplanation,
  approveExplanation,
  rejectExplanation,
  regenerateExplanation,
} from '@/lib/actions/explanations'
import type { PatientExplanation } from '@/lib/data/explanations'

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
  reportId:           string
  modality:           string | null
  bodyPart:           string | null
  initialExplanation: PatientExplanation | null
}

export function PatientExplanationPanel({
  reportId, modality, bodyPart, initialExplanation,
}: Props) {
  const [explanation,    setExplanation]    = useState(initialExplanation)
  const [editedText,     setEditedText]     = useState(initialExplanation?.explanationText ?? '')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason,   setRejectReason]   = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const [isPending, startTransition]        = useTransition()

  const status = explanation?.status ?? null

  function resetRejectForm() {
    setShowRejectForm(false)
    setRejectReason('')
  }

  function handleGenerate() {
    startTransition(async () => {
      setError(null)
      const result = await generatePatientExplanation(reportId, modality, bodyPart)
      if (result.error) {
        setError(result.error)
      } else {
        setExplanation(result.explanation!)
        setEditedText(result.explanation!.explanationText)
        resetRejectForm()
      }
    })
  }

  function handleApprove() {
    if (!explanation) return
    startTransition(async () => {
      setError(null)
      const result = await approveExplanation(explanation.id, reportId, editedText)
      if (result.error) setError(result.error)
      else setExplanation(result.explanation!)
    })
  }

  function handleConfirmReject() {
    if (!explanation || !rejectReason.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await rejectExplanation(explanation.id, reportId, rejectReason)
      if (result.error) {
        setError(result.error)
      } else {
        setExplanation(result.explanation!)
        resetRejectForm()
      }
    })
  }

  function handleRegenerate() {
    if (!explanation) return
    startTransition(async () => {
      setError(null)
      const result = await regenerateExplanation(explanation.id, reportId, modality, bodyPart)
      if (result.error) {
        setError(result.error)
      } else {
        setExplanation(result.explanation!)
        setEditedText(result.explanation!.explanationText)
        resetRejectForm()
      }
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
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Patient Explanation
        </h2>
        {status && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status] ?? STATUS_BADGE.draft}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden">

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!status && (
          <div className="px-6 py-12 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">No patient explanation yet</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Generate a plain-language summary for the patient based on the finalized report.
              </p>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="mx-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? <>{spinnerSvg} Generating…</> : 'Generate Patient Explanation'}
            </button>
          </div>
        )}

        {/* ── Draft state ───────────────────────────────────────────────── */}
        {status === 'draft' && explanation && (
          <div className="p-5 space-y-4">

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <span className="font-semibold">Clinician review required.</span>{' '}
              Review and edit the explanation before approving. Write in plain language the patient
              can understand. Approved explanations are read-only — use Regenerate to revise.
            </div>

            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1.5"
                htmlFor="explanation-text"
              >
                Explanation text
              </label>
              <textarea
                id="explanation-text"
                rows={9}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                disabled={isPending}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-50 resize-y"
              />
            </div>

            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 italic">
              {explanation.disclaimer}
            </div>

            {/* Rejection form */}
            {showRejectForm ? (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-900">Reason for rejection *</p>
                <textarea
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  disabled={isPending}
                  placeholder="e.g. Too technical — needs simpler language."
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                />
                <div className="flex items-center gap-2">
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
                {error && <p className="text-xs text-red-700">{error}</p>}
              </div>
            ) : (
              <>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={!editedText.trim() || isPending}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold rounded-lg transition"
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
                    {isPending ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              </>
            )}

          </div>
        )}

        {/* ── Approved state ────────────────────────────────────────────── */}
        {status === 'approved' && explanation && (
          <div className="p-5 space-y-4">

            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs text-green-800">
              Approved and ready for patient communication. Use Regenerate to create a new draft if
              changes are needed.
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {explanation.explanationText}
            </div>

            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 italic">
              {explanation.disclaimer}
            </div>

            {explanation.approvedAt && (
              <p className="text-xs text-gray-400">
                Approved {formatDateTime(explanation.approvedAt)}
              </p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isPending}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
            >
              {isPending ? 'Regenerating…' : 'Regenerate'}
            </button>

          </div>
        )}

        {/* ── Rejected state ────────────────────────────────────────────── */}
        {status === 'rejected' && explanation && (
          <div className="p-5 space-y-4">

            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800">
              <span className="font-semibold">Rejected.</span>
              {explanation.rejectionReason && (
                <span> Reason: {explanation.rejectionReason}</span>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-4 text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">
              {explanation.explanationText}
            </div>

            {explanation.rejectedAt && (
              <p className="text-xs text-gray-400">
                Rejected {formatDateTime(explanation.rejectedAt)}
              </p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? <>{spinnerSvg} Regenerating…</> : 'Generate New Explanation'}
            </button>

          </div>
        )}

      </div>
    </section>
  )
}
