'use client'

import React, { useState, useRef, useEffect, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { handleReportForm } from '@/lib/actions/reports'
import { SmartStructuringPanel } from './SmartStructuringPanel'
import { VoiceDictationPanel } from './VoiceDictationPanel'
import { LiveDictationPanel } from '@/components/dictation/LiveDictationPanel'
import { buildExamInfo, buildDefaultTechnique } from '@/lib/ai/hpd-engine'
import { SectionSuggestions } from './SectionSuggestions'
import { getSpecialForm, SPECIAL_LAYOUTS, type SpecialFormSchema } from '@/config/special-forms'
import { emptySpecialForm, renderSpecialFormText, missingRequiredRows, cellKey } from '@/lib/reports/special-forms'
import type { Report, StructuredReportData } from '@/types/report'
import type { SpecialLayout } from '@/types/exam'
import type { Template } from '@/types/template'
import type { UserPhrasePreference } from '@/types/preference'

const textareaCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y'

const selectCls =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'

interface PatientInfo {
  name: string
  age:  string
  sex:  string
}

interface Props {
  report:         Report
  canWrite:       boolean
  canAmend:       boolean
  templates:      Template[]
  modality:       string | null
  bodyPart:       string | null
  initialPhrases: UserPhrasePreference[]
  patientInfo:    PatientInfo
  examDate:       string
}

// ─── Live document editor ─────────────────────────────────────────────────────
// Renders the report as an editable radiology document (HPD format) rather than
// a set of form fields. Editable text blends into the document and auto-grows;
// on focus it highlights so the radiologist sees where they are typing.

function AutoTextarea({
  value, onChange, disabled, placeholder, ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
  ariaLabel: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      className="w-full bg-transparent resize-none overflow-hidden outline-none rounded px-1.5 -mx-1.5 py-0.5 text-[13.5px] leading-[1.75] text-justify text-gray-800 placeholder:text-gray-300 placeholder:text-left disabled:text-gray-700 disabled:cursor-default focus:bg-blue-50/50 transition-colors"
    />
  )
}

function PatientField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="font-bold text-slate-600">{label} :</span>
      <span className="text-slate-800">{value || '—'}</span>
    </div>
  )
}

function DocSection({
  label, value, onChange, disabled, placeholder, ariaLabel, required, suggestions,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
  ariaLabel: string
  required?: boolean
  suggestions?: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <h3 className="text-[12px] font-bold tracking-[0.1em] text-slate-900 uppercase underline underline-offset-[5px] decoration-slate-400 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5 no-underline">*</span>}
      </h3>
      {suggestions && <div className="font-sans">{suggestions}</div>}
      <AutoTextarea
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
      />
    </section>
  )
}

// F18 — editable measurement table for a special exam form. The radiologist types
// every value; nothing is computed or pre-filled. Reference values are read-only.
function SpecialFormTableEditor({
  schema, values, onCellChange, disabled, t,
}: {
  schema:      SpecialFormSchema
  values:      Record<string, string>
  onCellChange:(key: string, value: string) => void
  disabled:    boolean
  t:           ReturnType<typeof useTranslations>
}) {
  const missing = new Set(missingRequiredRows({ layout: schema.layout, values }).map((r) => r.key))
  const th = 'border border-slate-300 bg-slate-50 px-2 py-1 text-left font-semibold text-slate-700'
  return (
    <section className="mb-5 font-sans">
      <h3 className="text-[12px] font-bold tracking-[0.1em] text-slate-900 uppercase underline underline-offset-[5px] decoration-slate-400 mb-1.5 font-serif">
        {t('resultsLabel')}
        <span className="text-red-500 ml-0.5 no-underline">*</span>
      </h3>
      <p className="text-[11px] text-slate-500 mb-2">{schema.instructions}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={th}>Paramètre</th>
              {schema.valueColumns.map((c) => (
                <th key={c.key} className={th}>{c.label}</th>
              ))}
              {schema.showReference && <th className={th}>Valeur usuelle</th>}
            </tr>
          </thead>
          <tbody>
            {schema.rows.map((row) => {
              const isMissing = missing.has(row.key)
              return (
                <tr key={row.key}>
                  <td className="border border-slate-300 px-2 py-1 align-top text-slate-700">
                    {row.label}{row.unit ? ` (${row.unit})` : ''}
                    {row.required && <span className="text-red-500 ml-0.5">*</span>}
                  </td>
                  {schema.valueColumns.map((c) => (
                    <td
                      key={c.key}
                      className={`border px-1 py-0.5 ${isMissing ? 'border-red-300 bg-red-50/40' : 'border-slate-300'}`}
                    >
                      <input
                        type="text"
                        value={values[cellKey(row.key, c.key)] ?? ''}
                        onChange={(e) => onCellChange(cellKey(row.key, c.key), e.target.value)}
                        disabled={disabled}
                        aria-label={`${row.label} ${c.label}`}
                        className="w-full bg-transparent outline-none px-1 py-0.5 text-slate-800 disabled:text-slate-600 focus:bg-blue-50/50 rounded"
                      />
                    </td>
                  ))}
                  {schema.showReference && (
                    <td className="border border-slate-300 px-2 py-1 align-top text-slate-400">
                      {row.reference ?? '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StructuredEditor({
  draft, disabled, onChange, onSpecialCellChange, t, phrases, reportId, examDate,
}: {
  draft:    StructuredReportData
  disabled: boolean
  onChange: (key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>, value: string) => void
  onSpecialCellChange: (key: string, value: string) => void
  t:        ReturnType<typeof useTranslations>
  phrases:  UserPhrasePreference[]
  reportId: string
  examDate: string
}) {
  const specialSchema = draft.specialForm ? getSpecialForm(draft.specialForm.layout) : null
  const phrasesBySection = React.useMemo(() => {
    const map: Record<string, UserPhrasePreference[]> = {}
    for (const p of phrases) {
      if (!map[p.section]) map[p.section] = []
      map[p.section].push(p)
    }
    return map
  }, [phrases])

  const p = draft.patient

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Document paper ── */}
      <div className="px-6 md:px-12 py-9 font-serif">

        {/* Header band */}
        <div className="flex items-end justify-between border-b-2 border-slate-900 pb-2.5 mb-5">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
              {t('docHeaderTitle')}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{t('docHeaderDept')}</p>
          </div>
          {!disabled && (
            <span className="font-sans text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              {t('docEditable')}
            </span>
          )}
        </div>

        {/* Patient box */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 border border-slate-300 rounded px-4 py-2.5 mb-6 text-[11px]">
          <PatientField label={t('docPatientName')} value={p.name} />
          <PatientField label={t('docDate')}        value={examDate} />
          <PatientField label={t('docAge')}         value={p.age} />
          <PatientField label={t('docSex')}         value={p.sex} />
        </div>

        {/* Exam title */}
        <h2 className="text-center text-[15px] font-bold uppercase tracking-[0.07em] underline underline-offset-[6px] decoration-2 text-slate-900 mb-7">
          {draft.examTitle}
        </h2>

        {/* INDICATION — phrasing preferences allowed (non-diagnostic) */}
        <DocSection
          label={t('indicationLabel')}
          value={draft.indication}
          onChange={(v) => onChange('indication', v)}
          disabled={disabled}
          placeholder={t('indicationPlaceholder')}
          ariaLabel={t('indicationLabel')}
          suggestions={
            <SectionSuggestions
              section="indication" examType={draft.examType} reportId={reportId}
              currentText={draft.indication} phrases={phrasesBySection['indication'] ?? []}
              onApply={(v) => onChange('indication', v)} disabled={disabled}
            />
          }
        />
        {/* TECHNIQUE — phrasing preferences allowed (pure protocol text) */}
        <DocSection
          label={t('techniqueLabel')}
          value={draft.technique}
          onChange={(v) => onChange('technique', v)}
          disabled={disabled}
          placeholder={t('techniquePlaceholder')}
          ariaLabel={t('techniqueLabel')}
          suggestions={
            <SectionSuggestions
              section="technique" examType={draft.examType} reportId={reportId}
              currentText={draft.technique} phrases={phrasesBySection['technique'] ?? []}
              onApply={(v) => onChange('technique', v)} disabled={disabled}
            />
          }
        />
        {/* RÉSULTATS — special exams use a structured measurement table (F18);
            ordinary exams keep the free-text diagnostic field (no AI phrasing). */}
        {draft.specialForm && specialSchema ? (
          <SpecialFormTableEditor
            schema={specialSchema}
            values={draft.specialForm.values}
            onCellChange={onSpecialCellChange}
            disabled={disabled}
            t={t}
          />
        ) : (
          <DocSection
            label={t('resultsLabel')}
            value={draft.results}
            onChange={(v) => onChange('results', v)}
            disabled={disabled}
            placeholder={t('resultsPlaceholder')}
            ariaLabel={t('resultsLabel')}
            required
          />
        )}
        {/* CONCLUSION — phrasing preferences for openers only */}
        <DocSection
          label={t('conclusionLabel')}
          value={draft.conclusion}
          onChange={(v) => onChange('conclusion', v)}
          disabled={disabled}
          placeholder={t('conclusionPlaceholder')}
          ariaLabel={t('conclusionLabel')}
          required
          suggestions={
            <SectionSuggestions
              section="conclusion" examType={draft.examType} reportId={reportId}
              currentText={draft.conclusion} phrases={phrasesBySection['conclusion'] ?? []}
              onApply={(v) => onChange('conclusion', v)} disabled={disabled}
            />
          }
        />
        {/* RECOMMANDATIONS — optional; phrasing preferences allowed */}
        <DocSection
          label={t('recommendationsLabel')}
          value={draft.recommendations ?? ''}
          onChange={(v) => onChange('recommendations', v)}
          disabled={disabled}
          placeholder={t('recommendationsPlaceholder')}
          ariaLabel={t('recommendationsLabel')}
          suggestions={
            <SectionSuggestions
              section="recommendations" examType={draft.examType} reportId={reportId}
              currentText={draft.recommendations ?? ''} phrases={phrasesBySection['recommendations'] ?? []}
              onApply={(v) => onChange('recommendations', v)} disabled={disabled}
            />
          }
        />

        {/* Signature line */}
        <div className="mt-8 pt-3 text-right text-[12px] text-slate-700">
          <span className="font-bold">{t('docSignature')}</span>
        </div>
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

export function ReportEditor({ report, canWrite, canAmend, templates, modality, bodyPart, initialPhrases, patientInfo, examDate }: Props) {
  const t = useTranslations('reportEditor')

  const isFinalized = report.status === 'finalized'
  const isEditable  = !isFinalized && canWrite

  // Does this report carry pre-existing legacy content (created before the HPD workflow)?
  const hasLegacyContent = Boolean(
    report.findings?.trim() || report.impression?.trim() || (report.recommendations ?? '').trim(),
  )

  // Default reporting experience = HPD structured workflow.
  //  - Report already has structured data  → open it structured.
  //  - Legacy report with content, no JSON  → keep the legacy editor (migration path).
  //  - New / empty report                   → start a fresh HPD document in French.
  const [structuredDraft, setStructuredDraft] = useState<StructuredReportData | null>(() => {
    if (report.structuredData) return report.structuredData
    if (hasLegacyContent)      return null
    const { examType, examTitle } = buildExamInfo(modality, bodyPart)
    return {
      language:        'fr',
      examType,
      examTitle,
      patient:         { name: patientInfo.name, age: patientInfo.age, sex: patientInfo.sex },
      indication:      '',
      technique:       buildDefaultTechnique(modality),
      results:         '',
      conclusion:      '',
      recommendations: undefined,
    }
  })

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
  const specialForm = structuredDraft?.specialForm ?? null
  const hasSpecialForm = Boolean(specialForm)
  const specialIncomplete = specialForm ? missingRequiredRows(specialForm).length > 0 : false

  function updateSection(
    key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>,
    value: string,
  ) {
    setStructuredDraft((prev) => (prev ? { ...prev, [key]: value } : null))
    if (key === 'results')         setFindings(value)
    if (key === 'conclusion')      setImpression(value)
    if (key === 'recommendations') setRecommendations(value)
  }

  // F18 — switch a structured report to (or away from) a special measurement form.
  function setSpecialLayout(layout: SpecialLayout | '') {
    setStructuredDraft((prev) => {
      if (!prev) return prev
      if (!layout) {
        const next = { ...prev }
        delete next.specialForm
        return next
      }
      const schema = getSpecialForm(layout)
      const form =
        prev.specialForm && prev.specialForm.layout === layout
          ? prev.specialForm
          : emptySpecialForm(layout)
      const results = renderSpecialFormText(form)
      setFindings(results)
      return {
        ...prev,
        examType:  schema.examType,
        examTitle: schema.title,
        technique: prev.technique?.trim() ? prev.technique : schema.defaultTechnique,
        specialForm: form,
        results,
      }
    })
  }

  function updateSpecialCell(key: string, value: string) {
    setStructuredDraft((prev) => {
      if (!prev || !prev.specialForm) return prev
      const form = { ...prev.specialForm, values: { ...prev.specialForm.values, [key]: value } }
      const results = renderSpecialFormText(form)
      setFindings(results)
      return { ...prev, specialForm: form, results }
    })
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
      patient:         { name: patientInfo.name, age: patientInfo.age, sex: patientInfo.sex },
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
                {tmpl.isPersonal ? '★ ' : ''}{tmpl.title}{tmpl.modality ? ` (${tmpl.modality})` : ''}
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

      {/* ── Special structured exam selector (F18) ───────────────── */}
      {isEditable && isStructured && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <span className="text-xs font-semibold text-violet-800">{t('specialExamLabel')}</span>
          <select
            value={specialForm?.layout ?? ''}
            onChange={(e) => setSpecialLayout(e.target.value as SpecialLayout | '')}
            disabled={isPending}
            className={selectCls}
          >
            <option value="">{t('specialExamNone')}</option>
            {SPECIAL_LAYOUTS.map((l) => (
              <option key={l} value={l}>{getSpecialForm(l).title}</option>
            ))}
          </select>
          {hasSpecialForm && (
            <span className="text-[11px] text-violet-600">{t('specialExamHint')}</span>
          )}
        </div>
      )}

      {/* ── Voice dictation ──────── (free-text exams only) ──────── */}
      {isEditable && !hasSpecialForm && (
        <VoiceDictationPanel reportId={report.id} onApply={handleVoiceApply} />
      )}

      {/* ── Live browser dictation (Phase 6B) ── (free-text exams only) ── */}
      {isEditable && !hasSpecialForm && (
        <LiveDictationPanel
          modality={modality}
          bodyPart={bodyPart}
          patientName={patientInfo.name}
          patientAge={patientInfo.age}
          patientSex={patientInfo.sex}
          onApply={handleVoiceApply}
        />
      )}

      {/* ── AI structuring panel ── (free-text exams only) ──────── */}
      {isEditable && !hasSpecialForm && (
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
          onSpecialCellChange={updateSpecialCell}
          t={t}
          phrases={initialPhrases}
          reportId={report.id}
          examDate={examDate}
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
      {specialIncomplete && !isFinalized && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {t('specialIncomplete')}
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
              disabled={isPending || !canWrite || specialIncomplete}
              title={specialIncomplete ? t('specialIncomplete') : undefined}
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
