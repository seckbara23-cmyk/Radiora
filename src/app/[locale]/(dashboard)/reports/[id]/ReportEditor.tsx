'use client'

import { useState, useRef, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { handleReportForm } from '@/lib/actions/reports'
import { SmartStructuringPanel } from './SmartStructuringPanel'
import { VoiceDictationPanel } from './VoiceDictationPanel'
import type { Report } from '@/types/report'
import type { Template } from '@/types/template'
import type { StructuredDraft } from '@/lib/ai/mock-engine'

const textareaCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'
const selectCls =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'

interface Props {
  report: Report
  canWrite: boolean
  canAmend: boolean
  templates: Template[]
  modality: string | null
  bodyPart: string | null
}

export function ReportEditor({ report, canWrite, canAmend, templates, modality, bodyPart }: Props) {
  const t = useTranslations('reportEditor')
  const isFinalized = report.status === 'finalized'
  const isEditable  = !isFinalized && canWrite

  const [findings,        setFindings]        = useState(report.findings)
  const [impression,      setImpression]      = useState(report.impression)
  const [recommendations, setRecommendations] = useState(report.recommendations ?? '')
  const [selectedTpl, setSelectedTpl] = useState('')
  const [showAmendPanel, setShowAmendPanel] = useState(false)
  const [changeReason,   setChangeReason]   = useState('')

  const voiceKeyRef = useRef(0)
  const [voiceSignal, setVoiceSignal] = useState<{ text: string; key: number } | null>(null)

  const [state, formAction, isPending] = useActionState(handleReportForm, { error: null })

  function handleAiAccept(draft: StructuredDraft) {
    if (draft.findings)        setFindings(draft.findings)
    if (draft.impression)      setImpression(draft.impression)
    if (draft.recommendations) setRecommendations(draft.recommendations)
  }

  function handleVoiceApply(text: string) {
    setVoiceSignal({ text, key: ++voiceKeyRef.current })
  }

  function applyTemplate() {
    const tpl = templates.find((tmpl) => tmpl.id === selectedTpl)
    if (!tpl) return
    const hasContent = findings.trim() || impression.trim() || recommendations.trim()
    if (hasContent && !window.confirm(t('applyTemplateConfirm'))) {
      return
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTpl}
            onChange={(e) => setSelectedTpl(e.target.value)}
            disabled={isPending}
            className={`flex-1 min-w-0 ${selectCls}`}
          >
            <option value="">{t('applyTemplatePlaceholder')}</option>
            {templates.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.title}{tmpl.modality ? ` (${tmpl.modality})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyTemplate}
            disabled={!selectedTpl || isPending}
            className="flex-shrink-0 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 rounded-lg transition"
          >
            {t('apply')}
          </button>
        </div>
      )}

      {/* ── Voice Dictation Panel ─────────────────────────────────── */}
      {isEditable && (
        <VoiceDictationPanel
          reportId={report.id}
          onApply={handleVoiceApply}
        />
      )}

      {/* ── Smart Structuring Panel ───────────────────────────────── */}
      {isEditable && (
        <SmartStructuringPanel
          reportId={report.id}
          modality={modality}
          bodyPart={bodyPart}
          onAccept={handleAiAccept}
          voiceSignal={voiceSignal}
        />
      )}

      {/* ── Main editor ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        <div>
          <label className={labelCls} htmlFor="findings">{t('findingsLabel')}</label>
          <textarea
            id="findings" name="findings" rows={8}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            disabled={isPending || !isEditable}
            placeholder={t('findingsPlaceholder')}
            className={textareaCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="impression">{t('impressionLabel')}</label>
          <textarea
            id="impression" name="impression" rows={4}
            value={impression}
            onChange={(e) => setImpression(e.target.value)}
            disabled={isPending || !isEditable}
            placeholder={t('impressionPlaceholder')}
            className={textareaCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="recommendations">{t('recommendationsLabel')}</label>
          <textarea
            id="recommendations" name="recommendations" rows={3}
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            disabled={isPending || !isEditable}
            placeholder={t('recommendationsPlaceholder')}
            className={textareaCls}
          />
        </div>

      </div>

      {/* ── Amendment reason panel ────────────────────────────────── */}
      {showAmendPanel && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">{t('amendTitle')}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t('amendDesc')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1.5" htmlFor="change_reason">
              {t('amendReasonLabel')}
            </label>
            <textarea
              id="change_reason"
              name="change_reason"
              rows={2}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder={t('amendReasonPlaceholder')}
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
              {isPending ? t('opening') : t('confirmAmendment')}
            </button>
            <button
              type="button"
              onClick={() => { setShowAmendPanel(false); setChangeReason('') }}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Amended status notice ────────────────────────────────── */}
      {report.status === 'amended' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">{t('amendedBold')}</span>{' '}{t('amendedText')}
        </div>
      )}

      {/* ── Finalization notice ───────────────────────────────────── */}
      {isFinalized && report.signedAt && !showAmendPanel && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {t('finalizedNotice', { date: report.signedAt.slice(0, 10) })}
          {canAmend && ` ${t('useAmendHint')}`}
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
          {t('draftSaved')}
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
              {t('amendReport')}
            </button>
          )
        ) : (
          <>
            <button
              type="submit"
              name="_submit"
              value="save"
              disabled={isPending || !canWrite}
              className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg transition"
            >
              {isPending ? t('saving') : t('saveDraft')}
            </button>
            <button
              type="submit"
              name="_submit"
              value="finalize"
              disabled={isPending || !canWrite}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? t('finalizing') : t('finalizeReport')}
            </button>
          </>
        )}
      </div>

      {!isFinalized && (
        <p className="text-xs text-gray-400 text-right">{t('disclaimer')}</p>
      )}
    </form>
  )
}
