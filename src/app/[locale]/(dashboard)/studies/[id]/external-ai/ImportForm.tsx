'use client'

import { useState, useRef, useTransition } from 'react'
import { importExternalAiResult } from '@/lib/actions/external-ai'
import type { ExternalAiResult, ExternalAiFinding } from '@/lib/data/external-ai'
import type { FindingInput } from '@/lib/actions/external-ai'

interface Props {
  studyId:  string
  reportId: string | null
  onImported: (result: ExternalAiResult, findings: ExternalAiFinding[]) => void
}

interface FindingRow extends FindingInput {
  _key: number
}

const SOURCE_TYPES = [
  { value: 'manual_entry',            label: 'Manual Entry'         },
  { value: 'vendor_json',             label: 'Vendor JSON'          },
  { value: 'dicom_sr',                label: 'DICOM SR'             },
  { value: 'future_pacs_integration', label: 'PACS Integration'     },
]

const SEVERITY_OPTIONS = [
  { value: '',         label: '— none —' },
  { value: 'low',      label: 'Low'      },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high',     label: 'High'     },
  { value: 'critical', label: 'Critical' },
]

const LATERALITY_OPTIONS = [
  { value: '',          label: '— none —'  },
  { value: 'left',      label: 'Left'      },
  { value: 'right',     label: 'Right'     },
  { value: 'bilateral', label: 'Bilateral' },
  { value: 'midline',   label: 'Midline'   },
]

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-50'

const selectCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50'

function emptyFinding(key: number): FindingRow {
  return {
    _key: key, findingLabel: '', bodyRegion: '',
    laterality: '', confidence: null, severity: '', recommendation: '',
  }
}

export function ImportForm({ studyId, reportId, onImported }: Props) {
  const [open, setOpen]           = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const keyRef                    = useRef(0)

  // Result-level fields
  const [sourceType,        setSourceType]        = useState('manual_entry')
  const [vendorName,        setVendorName]        = useState('')
  const [modelName,         setModelName]         = useState('')
  const [modelVersion,      setModelVersion]      = useState('')
  const [overallConfStr,    setOverallConfStr]    = useState('')
  const [summaryText,       setSummaryText]       = useState('')

  // Dynamic findings
  const [findings, setFindings] = useState<FindingRow[]>([emptyFinding(++keyRef.current)])

  function addFinding() {
    setFindings((prev) => [...prev, emptyFinding(++keyRef.current)])
  }

  function removeFinding(key: number) {
    setFindings((prev) => prev.filter((f) => f._key !== key))
  }

  function updateFinding(key: number, patch: Partial<FindingRow>) {
    setFindings((prev) => prev.map((f) => f._key === key ? { ...f, ...patch } : f))
  }

  function resetForm() {
    keyRef.current = 0
    setSourceType('manual_entry')
    setVendorName('')
    setModelName('')
    setModelVersion('')
    setOverallConfStr('')
    setSummaryText('')
    setFindings([emptyFinding(++keyRef.current)])
    setError(null)
  }

  function handleSubmit() {
    const parsedConf = overallConfStr ? parseFloat(overallConfStr) : null
    if (parsedConf !== null && (parsedConf < 0 || parsedConf > 100)) {
      setError('Overall confidence must be between 0 and 100.')
      return
    }

    const validFindings = findings.filter((f) => f.findingLabel.trim())
    if (validFindings.length === 0) {
      setError('At least one finding with a label is required.')
      return
    }

    startTransition(async () => {
      setError(null)
      const result = await importExternalAiResult({
        studyId,
        reportId:         reportId ?? null,
        sourceType,
        vendorName:       vendorName.trim() || undefined,
        modelName:        modelName.trim()  || undefined,
        modelVersion:     modelVersion.trim() || undefined,
        overallConfidence: parsedConf,
        summaryText:      summaryText.trim() || undefined,
        findings:         validFindings.map((f) => ({
          findingLabel:   f.findingLabel.trim(),
          bodyRegion:     f.bodyRegion?.trim() || undefined,
          laterality:     f.laterality || undefined,
          confidence:     f.confidence,
          severity:       f.severity || undefined,
          recommendation: f.recommendation?.trim() || undefined,
        })),
      })

      if (result.error) {
        setError(result.error)
        return
      }

      resetForm()
      setOpen(false)
      onImported(result.result!, result.findings!)
    })
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/30 overflow-hidden">

      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-teal-50/60 transition"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          <span className="text-sm font-semibold text-teal-900">Import External AI Result</span>
          <span className="text-xs text-teal-600 bg-teal-100 rounded-full px-2 py-0.5 font-medium">Manual Entry</span>
        </div>
        <svg
          className={`w-4 h-4 text-teal-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-teal-200 px-5 py-5 space-y-5">

          {/* Result metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source Type</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} disabled={isPending} className={selectCls}>
                {SOURCE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Overall Confidence (0–100)</label>
              <input
                type="number" min="0" max="100" step="0.1"
                value={overallConfStr}
                onChange={(e) => setOverallConfStr(e.target.value)}
                disabled={isPending}
                placeholder="e.g. 87"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendor Name</label>
              <input
                type="text" value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                disabled={isPending} placeholder="e.g. Aidoc"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model Name</label>
              <input
                type="text" value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                disabled={isPending} placeholder="e.g. CXR-Detect v2"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model Version</label>
              <input
                type="text" value={modelVersion}
                onChange={(e) => setModelVersion(e.target.value)}
                disabled={isPending} placeholder="e.g. 2.1.0"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">AI Summary</label>
            <textarea
              rows={3} value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              disabled={isPending}
              placeholder="Brief summary from the AI system…"
              className={`${inputCls} resize-y`}
            />
          </div>

          {/* Findings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Findings <span className="text-red-500">*</span>
              </p>
              <button
                type="button"
                onClick={addFinding}
                disabled={isPending}
                className="text-xs font-medium text-teal-700 hover:text-teal-900 bg-teal-100 hover:bg-teal-200 px-2.5 py-1 rounded-md transition disabled:opacity-50"
              >
                + Add Finding
              </button>
            </div>

            <div className="space-y-3">
              {findings.map((f, idx) => (
                <div key={f._key} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-400">Finding {idx + 1}</p>
                    {findings.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeFinding(f._key)}
                        disabled={isPending}
                        className="text-xs text-red-400 hover:text-red-600 transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Finding Label <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={f.findingLabel}
                      onChange={(e) => updateFinding(f._key, { findingLabel: e.target.value })}
                      disabled={isPending}
                      placeholder="e.g. Pulmonary nodule, right upper lobe"
                      className={inputCls}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Body Region</label>
                      <input
                        type="text"
                        value={f.bodyRegion ?? ''}
                        onChange={(e) => updateFinding(f._key, { bodyRegion: e.target.value })}
                        disabled={isPending}
                        placeholder="e.g. Lung"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Laterality</label>
                      <select
                        value={f.laterality ?? ''}
                        onChange={(e) => updateFinding(f._key, { laterality: e.target.value })}
                        disabled={isPending}
                        className={selectCls}
                      >
                        {LATERALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Confidence (0–100)</label>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={f.confidence !== null ? f.confidence : ''}
                        onChange={(e) => updateFinding(f._key, {
                          confidence: e.target.value ? parseFloat(e.target.value) : null
                        })}
                        disabled={isPending}
                        placeholder="87"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
                      <select
                        value={f.severity ?? ''}
                        onChange={(e) => updateFinding(f._key, { severity: e.target.value })}
                        disabled={isPending}
                        className={selectCls}
                      >
                        {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Recommendation</label>
                    <input
                      type="text"
                      value={f.recommendation ?? ''}
                      onChange={(e) => updateFinding(f._key, { recommendation: e.target.value })}
                      disabled={isPending}
                      placeholder="e.g. Follow-up CT in 3 months"
                      className={inputCls}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Importing…
                </>
              ) : 'Import Result'}
            </button>
            <button
              type="button"
              onClick={() => { resetForm(); setOpen(false) }}
              disabled={isPending}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
