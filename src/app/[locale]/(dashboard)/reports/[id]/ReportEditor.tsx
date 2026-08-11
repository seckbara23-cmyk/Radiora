'use client'

import React, { useState, useRef, useEffect, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { handleReportForm } from '@/lib/actions/reports'
import { DictationWorkspace } from './DictationWorkspace'
import { buildExamInfo, buildDefaultTechnique } from '@/lib/ai/hpd-engine'
import { SectionSuggestions } from './SectionSuggestions'
import { LiveSectionStatus } from './LiveSectionStatus'
import { useLiveStructuring, type AppliedSection } from '@/lib/hooks/use-live-structuring'
import type { SectionKey } from '@/lib/safety/sections'
import { getSpecialForm, SPECIAL_LAYOUTS, type SpecialFormSchema } from '@/config/special-forms'
import { emptySpecialForm, renderSpecialFormText, missingRequiredRows, cellKey } from '@/lib/reports/special-forms'
import { withPatient } from '@/lib/reports/patient-identity'
import { ReviewSummary, useSigningReadiness } from './ReviewSummary'
import type { SectionConfidence } from '@/types/structuring'
import type { Report, StructuredReportData, SectionProvenanceValue } from '@/types/report'
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

type EditableSection = keyof Pick<
  StructuredReportData,
  'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'
>

/** Clearing a section clears its authorship too — nobody owns empty text. */
function omitProvenance(
  map: StructuredReportData['sectionProvenance'],
  key: EditableSection,
): StructuredReportData['sectionProvenance'] {
  if (!map) return map
  const next = { ...map }
  delete next[key]
  return next
}

interface Props {
  report:         Report
  canWrite:       boolean
  canAmend:       boolean
  /** R2.9 — radiologist-only, from canSignReports. NOT clinical-write authority:
   *  a clinic admin may correct a draft but may never validate or sign it. */
  canSign:        boolean
  templates:      Template[]
  modality:       string | null
  bodyPart:       string | null
  initialPhrases: UserPhrasePreference[]
  patientInfo:    PatientInfo
  examDate:       string
  /** R2.3 — transcript already stored for this report (report-owned, R2.2). */
  initialTranscript?: string
  /** R2.9 — the signing gate's own inputs, so the live readiness shown beside
   *  the Sign button is the same verdict finalizeReport will reach. */
  aiConfidence?:      SectionConfidence[] | null
  cleanedTranscript?: string | null
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
  label, value, onChange, disabled, placeholder, ariaLabel, required, suggestions, status, updated,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
  ariaLabel: string
  required?: boolean
  suggestions?: React.ReactNode
  /** R2.5 live review state for this section. */
  status?: React.ReactNode
  /** Briefly true when live structuring just wrote here. */
  updated?: boolean
}) {
  return (
    <section
      /* A calm, brief tint — enough to notice the section filled in, not enough
         to pull the eye off the text being dictated. No movement at all under
         prefers-reduced-motion. */
      className={`mb-5 -mx-2 rounded px-2 transition-colors duration-700 motion-reduce:transition-none ${
        updated ? 'bg-blue-50/70' : 'bg-transparent'
      }`}
    >
      <h3 className="text-[12px] font-bold tracking-[0.1em] text-slate-900 uppercase underline underline-offset-[5px] decoration-slate-400 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5 no-underline">*</span>}
      </h3>
      {status}
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
  draft, disabled, onChange, onSpecialCellChange, t, phrases, reportId, examDate, live, flash,
}: {
  draft:    StructuredReportData
  disabled: boolean
  onChange: (key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>, value: string) => void
  onSpecialCellChange: (key: string, value: string) => void
  t:        ReturnType<typeof useTranslations>
  phrases:  UserPhrasePreference[]
  reportId: string
  examDate: string
  live?:    ReturnType<typeof useLiveStructuring>
  flash?:   Partial<Record<SectionKey, true>>
}) {
  /** The live status row for one section, or nothing when it has no state. */
  const liveStatus = (section: SectionKey) =>
    live ? (
      <LiveSectionStatus
        section={section}
        flags={live.flags[section] ?? []}
        suggestion={live.suggestions[section]}
        owned={live.owned.includes(section)}
        disabled={disabled}
        onAccept={live.accept}
        onReject={live.reject}
        onResumeAi={live.resumeAi}
      />
    ) : null

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
          status={liveStatus('indication')}
          updated={flash?.indication}
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
          status={liveStatus('technique')}
          updated={flash?.technique}
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
            status={liveStatus('results')}
            updated={flash?.results}
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
          status={liveStatus('conclusion')}
          updated={flash?.conclusion}
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
          status={liveStatus('recommendations')}
          updated={flash?.recommendations}
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

export function ReportEditor({ report, canWrite, canAmend, canSign, templates, modality, bodyPart, initialPhrases, patientInfo, examDate, initialTranscript = '', aiConfidence = null, cleanedTranscript = null }: Props) {
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
    // R2.7C(F) — patient identity is authoritative from the DB (`patientInfo`),
    // never from a structuring draft. A stored report keeps its own block only
    // when that block still names someone: a draft applied before R2.7C wrote
    // the placeholder "—" into it, and re-reading the patient row heals it.
    if (report.structuredData) return withPatient(report.structuredData, patientInfo)
    if (hasLegacyContent)      return null
    const { examType, examTitle } = buildExamInfo(modality, bodyPart)
    const technique = buildDefaultTechnique(modality)
    return {
      language:        'fr',
      examType,
      examTitle,
      patient:         { name: patientInfo.name, age: patientInfo.age, sex: patientInfo.sex },
      indication:      '',
      technique,
      results:         '',
      conclusion:      '',
      recommendations: undefined,
      // The protocol paragraph is the one string nobody dictated.
      sectionProvenance: technique.trim() ? { technique: 'template' } : {},
    }
  })

  // Legacy fields — kept in sync with structured mode for backward compat
  const [findings,        setFindings]        = useState(report.findings)
  const [impression,      setImpression]      = useState(report.impression)
  const [recommendations, setRecommendations] = useState(report.recommendations ?? '')

  const [selectedTpl,    setSelectedTpl]    = useState('')
  const [showAmendPanel, setShowAmendPanel] = useState(false)
  const [changeReason,   setChangeReason]   = useState('')

  const [state, formAction, isPending] = useActionState(handleReportForm, { error: null })

  const isStructured = structuredDraft !== null
  const specialForm = structuredDraft?.specialForm ?? null
  const hasSpecialForm = Boolean(specialForm)
  const specialIncomplete = specialForm ? missingRequiredRows(specialForm).length > 0 : false

  // R2.9 — the exact content `finalizeReport` will receive in the form, so the
  // readiness shown next to the Sign button is the server's verdict in advance.
  const reviewContent = {
    structuredData:  structuredDraft,
    findings,
    impression,
    recommendations: recommendations || null,
  }
  const readiness = useSigningReadiness(reviewContent, aiConfidence)

  // ── R2.5 live structuring ───────────────────────────────────────────────────
  // The coordinator decides; this component applies what it decided. Sections
  // it wrote land through the same `updateSection` a human edit uses, so the
  // legacy mirror fields and the canonical draft never diverge.
  const [flash, setFlash] = useState<Partial<Record<SectionKey, true>>>({})

  const live = useLiveStructuring({
    modality,
    bodyPart,
    base: report.structuredData ?? null,
    frozen: isFinalized,
    onApplied: (written: AppliedSection[]) => {
      for (const s of written) writeSection(s.key, s.text, s.origin)
      const keys = written.map((s) => s.key)
      setFlash((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, true])) }))
      window.setTimeout(() => {
        setFlash((prev) => {
          const next = { ...prev }
          for (const k of keys) delete next[k]
          return next
        })
      }, 1400)
    },
  })

  /**
   * Write section text and record WHO wrote it.
   *
   * R2.7C(D) — the provenance saved here is what a later reload uses to decide
   * which sections the radiologist owns, so it must be set on every write path
   * rather than re-guessed from whether the section is empty.
   */
  function writeSection(
    key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>,
    value: string,
    origin: SectionProvenanceValue = 'dictation',
  ) {
    setStructuredDraft((prev) =>
      prev
        ? {
            ...prev,
            [key]: value,
            sectionProvenance: value.trim()
              ? { ...prev.sectionProvenance, [key]: origin }
              : omitProvenance(prev.sectionProvenance, key),
          }
        : null,
    )
    if (key === 'results')         setFindings(value)
    if (key === 'conclusion')      setImpression(value)
    if (key === 'recommendations') setRecommendations(value)
  }

  /**
   * A human edited this section. It becomes theirs: live AI may propose here
   * afterwards but never writes again until they hand it back — and now that
   * survives a save and reload, because the authorship is persisted.
   */
  function updateSection(
    key: keyof Pick<StructuredReportData, 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'>,
    value: string,
  ) {
    writeSection(key, value, 'physician_edit')
    live.notePhysicianEdit(key, value)
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
      const technique = prev.technique?.trim() ? prev.technique : schema.defaultTechnique
      return {
        ...prev,
        examType:  schema.examType,
        examTitle: schema.title,
        technique,
        specialForm: form,
        results,
        // F18 measurements are typed by the radiologist; the protocol is boilerplate.
        sectionProvenance: {
          ...prev.sectionProvenance,
          ...(results.trim() ? { results: 'physician_edit' as const } : {}),
          ...(prev.technique?.trim() ? {} : { technique: 'template' as const }),
        },
      }
    })
  }

  function updateSpecialCell(key: string, value: string) {
    setStructuredDraft((prev) => {
      if (!prev || !prev.specialForm) return prev
      const form = { ...prev.specialForm, values: { ...prev.specialForm.values, [key]: value } }
      const results = renderSpecialFormText(form)
      setFindings(results)
      return {
        ...prev,
        specialForm: form,
        results,
        sectionProvenance: { ...prev.sectionProvenance, results: 'physician_edit' },
      }
    })
  }

  function handleAiAccept(incoming: StructuredReportData) {
    // R2.7C(F) — a structuring draft describes the CONTENT of the report, never
    // who the patient is. Applying it must not let the draft's patient block
    // (which is a placeholder when the run had no patient context) overwrite the
    // identity resolved from the patient row.
    const structuredData = withPatient(incoming, patientInfo)
    setStructuredDraft(structuredData)
    setFindings(structuredData.results)
    setImpression(structuredData.conclusion)
    setRecommendations(structuredData.recommendations ?? '')
    // The radiologist applied a server-side structuring run. Re-baseline the
    // live coordinator on it so the next stable sentence diffs against what is
    // now on screen instead of stale live text.
    live.adopt(structuredData)
  }

  function convertToStructured() {
    if (isStructured) return
    const { examType, examTitle } = buildExamInfo(modality, bodyPart)
    const technique = buildDefaultTechnique(modality)
    setStructuredDraft({
      language:        'fr',
      examType,
      examTitle,
      patient:         { name: patientInfo.name, age: patientInfo.age, sex: patientInfo.sex },
      indication:      '',
      technique,
      results:         findings,
      conclusion:      impression,
      recommendations: recommendations || undefined,
      // Migrating a legacy report: its existing content was written by a human.
      sectionProvenance: {
        ...(technique.trim()       ? { technique: 'template' as const }            : {}),
        ...(findings.trim()        ? { results: 'physician_edit' as const }        : {}),
        ...(impression.trim()      ? { conclusion: 'physician_edit' as const }     : {}),
        ...(recommendations.trim() ? { recommendations: 'physician_edit' as const } : {}),
      },
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
              // Template text is machine-authored boilerplate until a human
              // edits it, and must not read as the radiologist's own words.
              sectionProvenance: {
                ...prev.sectionProvenance,
                ...(tpl.findingsTemplate.trim()        ? { results: 'template' as const }         : {}),
                ...(tpl.impressionTemplate.trim()      ? { conclusion: 'template' as const }      : {}),
                ...(tpl.recommendationsTemplate.trim() ? { recommendations: 'template' as const } : {}),
              },
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
                {/* A <select> option cannot hold an icon, so "personal" is a
                    WORD rather than a ★ glyph — which rendered as a coloured
                    emoji on some platforms and meant nothing to a first-time
                    user either way. */}
                {tmpl.isPersonal ? `${t('templatePersonal')} · ` : ''}{tmpl.title}{tmpl.modality ? ` (${tmpl.modality})` : ''}
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

      {/* ── Dictation workspace (R2.3) ── (free-text exams only) ──────────────
          One clinical question — computer / phone / import — over the same
          report-owned transcript and the canonical structuring pipeline. It
          replaced the three technical panels the doctor used to choose between
          (classic recording, live dictation, AI structuring); the two that were
          only ever composed here — VoiceDictationPanel and
          SmartStructuringPanel — were deleted in R2.9 once proven unreachable.
          LiveDictationPanel remains, still serving the vacation queue. */}
      {/* R2.5 — dictation on the left, the report filling in on the right. On
          narrow screens they stack in the same order.
          R2.9 — the page no longer caps this at 896px, so the document column
          gets the width a radiologist's screen actually has. The dictation rail
          keeps a fixed comfortable width and every extra pixel goes to the
          report, which is the thing being read. */}
      <div
        className={
          isEditable && !hasSpecialForm
            ? 'grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start'
            : ''
        }
      >
        {isEditable && !hasSpecialForm && (
          <div className="lg:sticky lg:top-4">
            <DictationWorkspace
              reportId={report.id}
              initialTranscript={initialTranscript}
              onApply={handleAiAccept}
              onStableTranscript={(stable, opts) => live.submit(stable, opts && { force: opts.final })}
            />
          </div>
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
            live={live}
            flash={flash}
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
      </div>

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

      {/* ── Review + action ──────────────────────────────────────────
          R2.9 — validation and the act it authorises are now the same region.
          The blockers above the button are computed from the draft ON SCREEN
          with the same pure function `finalizeReport` runs on the submitted
          form, so this is a preview of the server's verdict, not a second
          opinion that can disagree with it. */}
      {!isFinalized && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <ReviewSummary
            content={reviewContent}
            aiConfidence={aiConfidence}
            rawTranscript={initialTranscript || null}
            cleanedTranscript={cleanedTranscript}
            readiness={readiness}
            canSign={canSign}
          />

          {/* Only a radiologist validates and signs. A clinic admin may correct
              a draft (canWrite) but must never be offered the signing action —
              before R2.9 the button was enabled for them and failed server-side. */}
          {!canSign && canWrite && (
            <p className="text-xs leading-relaxed text-gray-500">{t('signRadiologistOnly')}</p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="submit" name="_submit" value="save"
              disabled={isPending || !canWrite}
              className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg transition"
            >
              {isPending ? t('saving') : t('saveDraft')}
            </button>
            {canSign && (
              <button
                type="submit" name="_submit" value="finalize"
                disabled={isPending || !canWrite || specialIncomplete || !readiness.canSign}
                title={
                  specialIncomplete ? t('specialIncomplete')
                  : !readiness.canSign ? t('signBlockedHint')
                  : undefined
                }
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition"
              >
                {isPending ? t('finalizing') : t('finalizeReport')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* A signed report: the only remaining editorial act is a formal amendment.
          Everything else it is now for lives in SignedActions, outside this form. */}
      {isFinalized && canAmend && !showAmendPanel && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button" onClick={() => setShowAmendPanel(true)}
            className="px-5 py-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-sm font-semibold rounded-lg transition"
          >
            {t('amendReport')}
          </button>
        </div>
      )}

      {!isFinalized && (
        <p className="text-xs text-gray-400 text-right">{t('disclaimer')}</p>
      )}
    </form>
  )
}
