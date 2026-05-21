'use client'

import { useState, useTransition } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  reviewExternalAiResult,
  acceptFinding,
  rejectFinding,
  archiveExternalAiResult,
  applyAcceptedFindingsToReport,
} from '@/lib/actions/external-ai'
import type { ExternalAiResult, ExternalAiFinding } from '@/lib/data/external-ai'

const STATUS_BADGE: Record<string, string> = {
  imported: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  reviewed: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  accepted: 'bg-green-50 text-green-700 ring-green-600/20',
  rejected: 'bg-red-50 text-red-700 ring-red-600/20',
  archived: 'bg-gray-50 text-gray-600 ring-gray-500/20',
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 ring-red-600/20',
  high:     'bg-orange-100 text-orange-800 ring-orange-600/20',
  moderate: 'bg-yellow-100 text-yellow-800 ring-yellow-600/20',
  low:      'bg-green-100 text-green-800 ring-green-600/20',
}

function confidenceCls(conf: number): string {
  if (conf >= 80) return 'text-green-700 bg-green-50 border-green-200'
  if (conf >= 60) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function formatDateTime(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: locale !== 'fr',
  })
}

interface FindingState {
  accepted:        boolean | null
  acceptedAt:      string | null
  rejectedAt:      string | null
  rejectionReason: string | null
  showRejectForm:  boolean
  rejectInput:     string
}

interface Props {
  result:     ExternalAiResult
  findings:   ExternalAiFinding[]
  reportId:   string | null
  canManage:  boolean
  onArchived: (resultId: string) => void
}

function deriveFindingState(f: ExternalAiFinding): FindingState {
  return {
    accepted:        f.accepted,
    acceptedAt:      f.acceptedAt,
    rejectedAt:      f.rejectedAt,
    rejectionReason: f.rejectionReason,
    showRejectForm:  false,
    rejectInput:     '',
  }
}

export function ResultCard({ result, findings, reportId, canManage, onArchived }: Props) {
  const t      = useTranslations('externalAi')
  const locale = useLocale()
  const [resultStatus, setResultStatus] = useState(result.status)
  const [findingStates, setFindingStates] = useState<Record<string, FindingState>>(
    () => Object.fromEntries(findings.map((f) => [f.id, deriveFindingState(f)])),
  )
  const [applied, setApplied] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function patchFinding(id: string, patch: Partial<FindingState>) {
    setFindingStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function handleReview() {
    startTransition(async () => {
      setError(null)
      const res = await reviewExternalAiResult(result.id, result.studyId)
      if (res.error) setError(res.error)
      else setResultStatus(res.result!.status)
    })
  }

  function handleAccept(findingId: string) {
    startTransition(async () => {
      setError(null)
      const res = await acceptFinding(findingId, result.id, result.studyId)
      if (res.error) {
        setError(res.error)
      } else {
        const f = res.finding!
        patchFinding(findingId, {
          accepted: f.accepted, acceptedAt: f.acceptedAt,
          rejectedAt: null, rejectionReason: null,
        })
      }
    })
  }

  function handleConfirmReject(findingId: string) {
    const reason = findingStates[findingId]?.rejectInput ?? ''
    if (!reason.trim()) return
    startTransition(async () => {
      setError(null)
      const res = await rejectFinding(findingId, result.id, result.studyId, reason)
      if (res.error) {
        setError(res.error)
      } else {
        const f = res.finding!
        patchFinding(findingId, {
          accepted: null, acceptedAt: null,
          rejectedAt: f.rejectedAt, rejectionReason: f.rejectionReason,
          showRejectForm: false, rejectInput: '',
        })
      }
    })
  }

  function handleArchive() {
    if (!window.confirm(t('archiveConfirm'))) return
    startTransition(async () => {
      setError(null)
      const res = await archiveExternalAiResult(result.id, result.studyId)
      if (res.error) setError(res.error)
      else onArchived(result.id)
    })
  }

  function handleApply() {
    if (!reportId) return
    startTransition(async () => {
      setError(null)
      const res = await applyAcceptedFindingsToReport(result.id, reportId, result.studyId)
      if (res.error) setError(res.error)
      else setApplied(true)
    })
  }

  const acceptedCount = Object.values(findingStates).filter((s) => s.accepted === true).length
  const sourceLabel   = result.sourceType.replace(/_/g, ' ')
  const identity      = [result.vendorName, result.modelName, result.modelVersion ? `v${result.modelVersion}` : null]
    .filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">

      {/* Result header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[resultStatus] ?? STATUS_BADGE.imported}`}>
                {resultStatus.charAt(0).toUpperCase() + resultStatus.slice(1)}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {sourceLabel}
              </span>
            </div>
            {identity && (
              <p className="text-sm font-medium text-gray-900">{identity}</p>
            )}
            <p className="text-xs text-gray-400">{formatDateTime(result.createdAt, locale)}</p>
          </div>
          {result.overallConfidence !== null && (
            <span className={`text-sm font-semibold rounded-md border px-2.5 py-1 flex-shrink-0 ${confidenceCls(result.overallConfidence)}`}>
              {result.overallConfidence}{t('confidencePct')}
            </span>
          )}
        </div>

        {result.summaryText && (
          <p className="mt-3 text-sm text-gray-700 leading-relaxed">{result.summaryText}</p>
        )}
      </div>

      {/* Findings list */}
      <div className="divide-y divide-gray-50">
        {findings.map((f) => {
          const fs     = findingStates[f.id]
          const status = fs.accepted === true   ? 'accepted'
                       : fs.rejectedAt !== null  ? 'rejected'
                       : 'pending'

          return (
            <div key={f.id} className="px-5 py-4 space-y-2.5">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {f.severity && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_BADGE[f.severity] ?? ''}`}>
                        {f.severity.toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-900">{f.findingLabel}</span>
                    {f.bodyRegion && (
                      <span className="text-xs text-gray-500">{f.bodyRegion}</span>
                    )}
                    {f.laterality && (
                      <span className="text-xs text-gray-400 capitalize">({f.laterality})</span>
                    )}
                  </div>

                  {f.confidence !== null && (
                    <span className={`inline-block text-xs rounded border px-1.5 py-0.5 ${confidenceCls(f.confidence)}`}>
                      {f.confidence}%
                    </span>
                  )}

                  {f.recommendation && (
                    <p className="text-xs text-gray-500 italic">→ {f.recommendation}</p>
                  )}
                </div>

                {/* Status pill */}
                {status === 'accepted' && (
                  <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 flex-shrink-0">
                    {t('accepted')}
                  </span>
                )}
                {status === 'rejected' && (
                  <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2.5 py-1 flex-shrink-0">
                    {t('rejected')}
                  </span>
                )}
              </div>

              {status === 'rejected' && fs.rejectionReason && (
                <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-1.5">
                  {t('reason')}{fs.rejectionReason}
                </p>
              )}

              {/* Action buttons */}
              {canManage && !fs.showRejectForm && (
                <div className="flex items-center gap-2 flex-wrap">
                  {status !== 'accepted' && (
                    <button
                      type="button"
                      onClick={() => handleAccept(f.id)}
                      disabled={isPending}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-semibold rounded-lg transition"
                    >
                      {t('accept')}
                    </button>
                  )}
                  {status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => patchFinding(f.id, { showRejectForm: true })}
                      disabled={isPending}
                      className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium rounded-lg transition"
                    >
                      {t('reject')}
                    </button>
                  )}
                  {status === 'accepted' && (
                    <button
                      type="button"
                      onClick={() => patchFinding(f.id, { showRejectForm: true })}
                      disabled={isPending}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
                    >
                      {t('undoAccept')}
                    </button>
                  )}
                </div>
              )}

              {canManage && fs.showRejectForm && (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-900">{t('rejectionReason')}</p>
                  <textarea
                    rows={2}
                    value={fs.rejectInput}
                    onChange={(e) => patchFinding(f.id, { rejectInput: e.target.value })}
                    disabled={isPending}
                    placeholder="e.g. Likely motion artefact — not clinically significant."
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmReject(f.id)}
                      disabled={!fs.rejectInput.trim() || isPending}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-medium rounded-lg transition"
                    >
                      {t('confirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => patchFinding(f.id, { showRejectForm: false, rejectInput: '' })}
                      disabled={isPending}
                      className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 transition"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-100 px-5 py-3.5 space-y-2.5">
        {error && <p className="text-xs text-red-600">{error}</p>}

        {applied && reportId && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center justify-between">
            <span>{t('findingsAppended', { count: acceptedCount })}</span>
            <a href={`/reports/${reportId}`} className="font-semibold underline ml-2 hover:text-green-900">
              {t('viewReport')}
            </a>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canManage && resultStatus === 'imported' && (
            <button
              type="button"
              onClick={handleReview}
              disabled={isPending}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold rounded-lg transition"
            >
              {t('markReviewed')}
            </button>
          )}

          {canManage && reportId && acceptedCount > 0 && !applied && (
            <button
              type="button"
              onClick={handleApply}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-xs font-semibold rounded-lg transition"
            >
              {isPending ? t('inserting') : t('insertFindings', { count: acceptedCount })}
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={isPending}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              {t('archive')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
