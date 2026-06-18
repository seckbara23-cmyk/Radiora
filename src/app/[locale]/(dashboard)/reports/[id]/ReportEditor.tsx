'use client'

import { useState, useRef, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { handleReportForm } from '@/lib/actions/reports'
import { SmartStructuringPanel } from './SmartStructuringPanel'
import { VoiceDictationPanel } from './VoiceDictationPanel'
import { buildExamInfo, buildDefaultTechnique } from '@/lib/ai/hpd-engine'
import type { Report, StructuredReportData } from '@/types/report'
import type { Template } from '@/types/template'

const textareaCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y'

const selectCls =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'

interface Props {
  report:    Report
  canWrite:  boolean
  canAmend:  boolean
  templates: Template[]
  modality:  string | null
  bodyPart:  string | null
}

// ─── Section editor ───────────────────────────────────────────────────────────

function HpdSectionRow({
  label, value, onChange, disabled, placeholder, rows, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
  rows: number
  required?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-bold tracking-[0.15em] text-slate-600 uppercase select-none">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={textareaCls}
      />
    </div>
  )
}

function StructuredEditor({
  draft, disabled, onChange, t,
}: {
  draft: StructuredReportData
  disabled: boolean
  onChange: (key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>, value: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Exam title header */}
      <div className="bg-slate-800 text-white px-6 py-4 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium mb-1">
          Compte Rendu Radiologique
        </p>
        <h2 className="text-base font-bold tracking-[0.1em] uppercase">
          {draft.examTitle}
        </h2>
        {(draft.patient.name && draft.patient.name !== '—') && (
          <p className="mt-1.5 text-xs text-slate-400">
            {draft.patient.name}
            {draft.patient.age && draft.patient.age !== '—' ? ` · ${draft.patient.age}` : ''}
            {draft.patient.sex && draft.patient.sex !== '—' ? ` · ${draft.patient.sex}` : ''}
          </p>
        )}
      </div>

      <div className="p-6 space-y-5">
        <HpdSectionRow
          label={t('indicationLabel')}
          value={draft.indication}
          onChange={(v) => onChange('indication', v)}
          disabled={disabled}
          placeholder={t('indicationPlaceholder')}
          rows={3}
        />
        <HpdSectionRow
          label={t('techniqueLabel')}
          value={draft.technique}
          onChange={(v) => onChange('technique', v)}
          disabled={disabled}
          placeholder={t('techniquePlaceholder')}
          rows={3}
        />
        <HpdSectionRow
          label={t('resultsLabel')}
          value={draft.results}
          onChange={(v) => onChange('results', v)}
          disabled={disabled}
          placeholder={t('resultsPlaceholder')}
          rows={9}
          required
        />
        <HpdSectionRow
          label={t('conclusionLabel')}
          value={draft.conclusion}
          onChange={(v) => onChange('conclusion', v)}
          disabled={disabled}
          placeholder={t('conclusionPlaceholder')}
          rows={4}
          required
        />
        <HpdSectionRow
          label={t('recommendationsLabel')}
          value={draft.recommendations ?? ''}
          onChange={(v) => onChange('recommendations', v)}
          disabled={disabled}
          placeholder={t('recommendationsPlaceholder')}
          rows={2}
        />
      </div>
    </div>
  )
}

function LegacyEditor({
  findings, setFindings, impression, setImpression,
  recommendations, setRecommendations, disabled, t,
}: {
  findings: string
  setFindings: (v: string) => void
  impression: string
  setImpression: (v: string) => void
  recommendations: string
  setRecommendations: (v: string) => void
  disabled: boolean
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="le-findings">
          {t('findingsLabel')}
        </label>
        <textarea
          id="le-findings" rows={8}
          value={findings} onChange={(e) => setFindings(e.target.value)}
          disabled={disabled} placeholder={t('findingsPlaceholder')}
          className={textareaCls}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="le-impression">
          {t('impressionLabel')}
        </label>
        <textarea
          id="le-impression" rows={4}
          value={impression} onChange={(e) => setImpression(e.target.value)}
          disabled={disabled} placeholder={t('impressionPlaceholder')}
          className={textareaCls}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="le-recommendations">
          {t('recommendationsLabel')}
        </label>
        <textarea
          id="le-recommendations" rows={3}
          value={recommendations} onChange={(e) => setRecommendations(e.target.value)}
          disabled={disabled} placeholder={t('recommendationsPlaceholder')}
          className={textareaCls}
        />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportEditor({ report, canWrite, canAmend, templates, modality, bodyPart }: Props) {
  const t = useTranslations('reportEditor')

  const isFinalized = report.status === 'finalized'
  const isEditable  = !isFinalized && canWrite

  // Structured mode
  const [structuredDraft, setStructuredDraft] = useState<StructuredReportData | null>(
    report.structuredData ?? null,
  )

  // Legacy fields — kept in sync with structured mode for backward compat
  const [findings,        setFindings]        = useState(report.findings)
  const [impression,      setImpression]      = useState(report.impression)
  const [recommendations, setRecommendations] = useState(report.recommendations ?? '')

  const [selectedTpl,    setSelectedTpl]    = useState('')
  const [showAmendPanel, setShowAmendPanel] = useState(false)
  const [changeReason,   setChangeReason]   = useState('')

  const voiceKeyRef = useRef(0)
  const [voiceSignal, setVoiceSignal] = useState<{ text: string; key: number } | null>(null)

  const [state, formAction, isPending] = useActionState(handleReportForm, { error: null })

  const isStructured = structuredDraft !== null

  function updateSection(
    key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>,
    value: string,
  ) {
    setStructuredDraft((prev) => (prev ? { ...prev, [key]: value } : null))
    if (key === 'results')         setFindings(value)
    if (key === 'conclusion')      setImpression(value)
    if (key === 'recommendations') setRecommendations(value)
  }

  function handleAiAccept(structuredData: StructuredReportData) {
    setStructuredDraft(structuredData)
    setFindings(structuredData.results)
    setImpression(structuredData.conclusion)
    setRecommendations(structuredData.recommendations ?? '')
  }

  function handleVoiceApply(text: string) {
    setVoiceSignal({ text, key: ++voiceKeyRef.current })
  }

  function convertToStructured() {
    if (isStructured) return
    const { examType, examTitle } = buildExamInfo(modality, bodyPart)
    setStructuredDraft({
      language:        'fr',
      examType,
      examTitle,
      patient:         { name: '', age: '', sex: '' },
      indication:      '',
      technique:       buildDefaultTechnique(modality),
      results:         findings,
      conclusion:      impression,
      recommendations: recommendations || undefined,
    })
  }

  function applyTemplate() {
    const tpl = templates.find((tmpl) => tmpl.id === selectedTpl)
    if (!tpl) return
    const hasContent = findings.trim() || impression.trim() || recommendations.trim()
    if (hasContent && !window.confirm(t('applyTemplateConfirm'))) return

    if (isStructured) {
      setStructuredDraft((prev) =>
        prev
          ? {
              ...prev,
              results:         tpl.findingsTemplate,
              conclusion:      tpl.impressionTemplate,
              recommendations: tpl.recommendationsTemplate || undefined,
            }
          : null,
      )
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

      {/* Always-submit legacy fields for backward compat with finalization validation */}
      <input type="hidden" name="findings"        value={findings} />
      <input type="hidden" name="impression"      value={impression} />
      <input type="hidden" name="recommendations" value={recommendations} />

      {/* Structured data payload — only present when in HPD mode */}
      {isStructured && (
        <input
          type="hidden"
          name="structured_data"
          value={JSON.stringify(structuredDraft)}
        />
      )}

      {/* ── Template selector ────────────────────────────────────── */}
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
            type="button" onClick={applyTemplate}
            disabled={!selectedTpl || isPending}
            className="flex-shrink-0 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 rounded-lg transition"
          >
            {t('apply')}
          </button>
        </div>
      )}

      {/* ── Voice dictation ──────────────────────────────────────── */}
      {isEditable && (
        <VoiceDictationPanel reportId={report.id} onApply={handleVoiceApply} />
      )}

      {/* ── AI structuring panel ─────────────────────────────────── */}
      {isEditable && (
        <SmartStructuringPanel
          reportId={report.id}
          modality={modality}
          bodyPart={bodyPart}
          onAccept={handleAiAccept}
          voiceSignal={voiceSignal}
        />
      )}

      {/* ── Report editor ────────────────────────────────────────── */}
      {isStructured ? (
        <StructuredEditor
          draft={structuredDraft}
          disabled={isPending || !isEditable}
          onChange={updateSection}
          t={t}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {isEditable && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={convertToStructured}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 rounded-full px-3 py-1 transition"
              >
                {t('switchToStructured')}
              </button>
            </div>
          )}
          <LegacyEditor
            findings={findings}               setFindings={setFindings}
            impression={impression}           setImpression={setImpression}
            recommendations={recommendations} setRecommendations={setRecommendations}
            disabled={isPending || !isEditable}
            t={t}
          />
        </div>
      )}

      {/* ── Amendment panel ──────────────────────────────────────── */}
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
              id="change_reason" name="change_reason" rows={2}
              value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
              placeholder={t('amendReasonPlaceholder')}
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit" name="_submit" value="amend"
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

      {/* ── Status notices ───────────────────────────────────────── */}
      {report.status === 'amended' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">{t('amendedBold')}</span>{' '}{t('amendedText')}
        </div>
      )}

      {isFinalized && report.signedAt && !showAmendPanel && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center justify-between gap-4 flex-wrap">
          <span>
            {t('finalizedNotice', { date: report.signedAt.slice(0, 10) })}
            {canAmend && ` ${t('useAmendHint')}`}
          </span>
          <a
            href={`print`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 bg-white border border-green-300 hover:bg-green-50 text-green-700 text-xs font-medium rounded-lg transition"
          >
            {t('printPdf')}
          </a>
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

      {/* ── Action buttons ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-gray-100">
        {isFinalized ? (
          canAmend && !showAmendPanel && (
            <button
              type="button" onClick={() => setShowAmendPanel(true)}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition"
            >
              {t('amendReport')}
            </button>
          )
        ) : (
          <>
            <button
              type="submit" name="_submit" value="save"
              disabled={isPending || !canWrite}
              className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg transition"
            >
              {isPending ? t('saving') : t('saveDraft')}
            </button>
            <button
              type="submit" name="_submit" value="finalize"
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
