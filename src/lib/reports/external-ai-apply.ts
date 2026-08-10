// R2.6 — applying accepted external-AI findings to a report, as a pure function.
//
// THE BUG THIS FIXES (open since the R1 audit)
// `applyAcceptedFindingsToReport` appended the suggestion block to the legacy
// `findings` COLUMN only. Structured reports keep their content in
// `structured_data`, and every export reads the structured model first
// (`getReportSections` only falls back to `findings` when `structured_data` is
// absent). So on a structured report the accepted findings were written to a
// column nothing renders: they appeared nowhere in the editor, the PDF, the
// DOCX or the print view, while the database claimed they had been applied.
//
// The fix is to write the CANONICAL model, keeping the legacy columns in sync
// exactly the way the editor already does. No second report content model is
// introduced — this projects into `StructuredReportData`, the same type
// `buildReportExportModel` consumes.
//
// Pure — no IO, no clock. The caller owns auth, immutability, the version
// snapshot and the database write.

import type { StructuredReportData } from '@/types/report'

export interface AcceptedFinding {
  finding_label:   string
  severity?:       string | null
  body_region?:    string | null
  laterality?:     string | null
  confidence?:     number | null
  recommendation?: string | null
}

/**
 * Render the suggestion block. Clearly attributed and clearly external: this is
 * another vendor's opinion, offered to the radiologist, not a Radiora finding.
 */
export function buildExternalAiBlock(
  vendor: string,
  model: string,
  version: string | null,
  findings: AcceptedFinding[],
): string {
  const header = `--- External AI Suggestions (${vendor}, ${model}${version ? ` v${version}` : ''}) ---`
  const lines = findings.map((f) => {
    const sev  = f.severity ? `[${f.severity.toUpperCase()}] ` : ''
    const loc  = [f.body_region, f.laterality].filter(Boolean).join(', ')
    const conf = f.confidence !== null && f.confidence !== undefined ? ` — confidence: ${f.confidence}%` : ''
    const rec  = f.recommendation ? `\n  → ${f.recommendation}` : ''
    return `• ${sev}${f.finding_label}${loc ? `, ${loc}` : ''}${conf}${rec}`
  })
  return `${header}\n${lines.join('\n')}`
}

export interface ApplyInput {
  /** The report's current canonical payload, or null for a legacy report. */
  structuredData: StructuredReportData | null
  /** Legacy mirror columns. */
  findings:        string | null
  impression:      string | null
  recommendations: string | null
  block:           string
}

export interface ApplyResult {
  /** Canonical payload to persist, or null when the report is legacy. */
  structuredData: StructuredReportData | null
  /** Legacy `findings` column, kept in sync with the canonical RÉSULTATS. */
  findings: string
}

/**
 * Append the block to the report's RÉSULTATS.
 *
 * Structured report → `structured_data.results` is the source of truth and the
 * legacy `findings` column is mirrored from it, which is exactly what
 * `ReportEditor.updateSection` does on every ordinary edit.
 *
 * Legacy report → only `findings` exists, so only `findings` is written.
 */
export function applyExternalAiFindings(input: ApplyInput): ApplyResult {
  const separator = '\n\n'

  if (input.structuredData) {
    const current = input.structuredData.results ?? ''
    const results = current.trim() ? `${current}${separator}${input.block}` : input.block
    return {
      structuredData: { ...input.structuredData, results },
      findings: results,
    }
  }

  const current = input.findings ?? ''
  return {
    structuredData: null,
    findings: current.trim() ? `${current}${separator}${input.block}` : input.block,
  }
}
