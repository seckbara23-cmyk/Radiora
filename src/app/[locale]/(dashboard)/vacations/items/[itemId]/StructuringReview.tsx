'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { structureTranscript, acceptStructuredReport } from '@/lib/actions/structuring'
import type { StructuringResult, SectionConfidence, StructuredSectionKey, Confidence } from '@/types/structuring'
import type { StructuredReportData } from '@/types/report'

interface Props {
  itemId:      string
  canStructure: boolean
  canAccept:    boolean
  hasTranscript: boolean
  hasReport:     boolean
  /** Stored result from a previous run, if any. */
  initial:      StructuringResult | null
}

const SECTION_ORDER: StructuredSectionKey[] = ['indication', 'technique', 'results', 'conclusion', 'recommendations']

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high:   'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low:    'bg-red-50 text-red-700 border-red-200',
}

function sectionText(data: StructuredReportData, key: StructuredSectionKey): string {
  switch (key) {
    case 'indication':      return data.indication
    case 'technique':       return data.technique
    case 'results':         return data.results
    case 'conclusion':      return data.conclusion
    case 'recommendations': return data.recommendations ?? ''
  }
}

export function StructuringReview({ itemId, canStructure, canAccept, hasTranscript, hasReport, initial }: Props) {
  const t = useTranslations('structuring')
  const router = useRouter()
  const [result, setResult] = useState<StructuringResult | null>(initial)
  const [error, setError]   = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [isRunning, startRun] = useTransition()
  const [isApplying, startApply] = useTransition()

  function run() {
    setError(null)
    setApplied(false)
    startRun(async () => {
      const res = await structureTranscript(itemId)
      if (res.error) { setError(res.error); return }
      setResult(res.result ?? null)
      router.refresh()
    })
  }

  function apply() {
    if (!result) return
    setError(null)
    startApply(async () => {
      const res = await acceptStructuredReport(itemId, result.structured)
      if (res.error) { setError(res.error); return }
      setApplied(true)
      router.refresh()
    })
  }

  const byKey: Partial<Record<StructuredSectionKey, SectionConfidence>> = {}
  result?.confidence.forEach((c) => { byKey[c.section] = c })

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{t('title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
        {canStructure && (
          <button
            type="button"
            onClick={run}
            disabled={isRunning || !hasTranscript}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? t('running') : result ? t('rerun') : t('runButton')}
          </button>
        )}
      </div>

      {!hasTranscript && <p className="mt-3 text-sm text-gray-400">{t('needsTranscript')}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <>
          {result.reviewRequired && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              ⚠ {t('reviewRequired')}
            </div>
          )}

          {/* 3-column side-by-side */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* LEFT — raw */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columnRaw')}</h3>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                {result.rawTranscript || '—'}
              </p>
            </div>

            {/* CENTER — cleaned */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columnCleaned')}</h3>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {result.cleanedTranscript || '—'}
              </p>
              {result.removedTokens.length > 0 && (
                <p className="mt-2 text-[11px] text-gray-400">
                  {t('removed')}: {result.removedTokens.map((r) => r.text.trim()).filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            {/* RIGHT — structured HPD */}
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columnStructured')}</h3>
              <p className="mt-2 text-xs font-semibold text-gray-900">{result.structured.examTitle}</p>
              <div className="mt-2 space-y-3">
                {SECTION_ORDER.map((key) => {
                  const conf = byKey[key]
                  if (key === 'recommendations' && !sectionText(result.structured, key)) return null
                  const value = sectionText(result.structured, key)
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {t(`sections.${key}` as Parameters<typeof t>[0])}
                        </span>
                        {conf && (
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${CONFIDENCE_STYLE[conf.confidence]}`}>
                            {t(`confidence.${conf.confidence}` as Parameters<typeof t>[0])}
                          </span>
                        )}
                        {conf?.autoFilled && (
                          <span className="text-[10px] text-amber-600">{t('autoFilled')}</span>
                        )}
                        {conf?.reviewRequired && (
                          <span className="text-[10px] text-red-500">• {t('reviewFlag')}</span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                        {value || <span className="italic text-gray-400">{t('empty')}</span>}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Self-correction audit trail */}
          {result.correctionEvents.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <h3 className="text-xs font-semibold text-gray-600">{t('corrections')}</h3>
              <ul className="mt-2 space-y-1">
                {result.correctionEvents.map((e, i) => (
                  <li key={i} className="text-[11px] text-gray-600">
                    <span className="rounded bg-gray-200 px-1 font-mono text-[10px] text-gray-700">{e.marker}</span>{' '}
                    <span className="text-red-500 line-through">{e.removed || '—'}</span>{' → '}
                    <span className="text-green-700">{e.kept}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Apply to report (radiologist) */}
          {canAccept && (
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={apply}
                disabled={isApplying || !hasReport}
                className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                title={hasReport ? undefined : t('applyNeedsReport')}
              >
                {isApplying ? t('applying') : t('apply')}
              </button>
              {applied && <span className="text-sm text-green-600">{t('applied')}</span>}
              {!hasReport && <span className="text-xs text-gray-400">{t('applyNeedsReport')}</span>}
            </div>
          )}
        </>
      )}

      <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-400">
        {t('safety')}
      </p>
    </section>
  )
}
