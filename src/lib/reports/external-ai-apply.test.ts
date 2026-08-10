import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildExternalAiBlock,
  applyExternalAiFindings,
  type AcceptedFinding,
} from '@/lib/reports/external-ai-apply'
import { buildReportExportModel } from '@/lib/export/model'
import { getReportSections } from '@/lib/safety/sections'
import type { StructuredReportData } from '@/types/report'

// R2.6 — regression tests for the R1 open bug: accepted external-AI findings
// were written to the legacy `findings` column, which a structured report does
// not render anywhere.

const ACCEPTED: AcceptedFinding[] = [
  {
    finding_label: 'Pulmonary nodule',
    severity: 'moderate',
    body_region: 'right upper lobe',
    laterality: 'right',
    confidence: 87,
    recommendation: 'CT follow-up in 3 months',
  },
]

const STRUCTURED: StructuredReportData = {
  language: 'fr',
  examType: 'scanner_thoracique',
  examTitle: 'SCANNER THORACIQUE',
  patient: { name: 'A. B.', age: '54 ans', sex: 'M' },
  indication: 'Toux chronique.',
  technique: 'Acquisition volumique.',
  results: 'Parenchyme pulmonaire sans condensation.',
  conclusion: 'Pas de foyer.',
}

const block = buildExternalAiBlock('Vendor', 'Model', '2.1', ACCEPTED)

describe('26. a structured report updates canonical structured_data', () => {
  it('appends to structured_data.results, not just the legacy column', () => {
    const out = applyExternalAiFindings({
      structuredData: STRUCTURED,
      findings: 'Parenchyme pulmonaire sans condensation.',
      impression: 'Pas de foyer.',
      recommendations: null,
      block,
    })

    expect(out.structuredData).not.toBeNull()
    expect(out.structuredData!.results).toContain('Pulmonary nodule')
    expect(out.structuredData!.results).toContain('Parenchyme pulmonaire sans condensation.')
    // The legacy column is kept in sync, exactly as the editor does.
    expect(out.findings).toBe(out.structuredData!.results)
  })

  it('leaves every other section untouched', () => {
    const out = applyExternalAiFindings({
      structuredData: STRUCTURED, findings: '', impression: '', recommendations: null, block,
    })
    expect(out.structuredData!.indication).toBe(STRUCTURED.indication)
    expect(out.structuredData!.technique).toBe(STRUCTURED.technique)
    expect(out.structuredData!.conclusion).toBe(STRUCTURED.conclusion)
    expect(out.structuredData!.examTitle).toBe(STRUCTURED.examTitle)
  })

  it('a legacy report still writes only the legacy column', () => {
    const out = applyExternalAiFindings({
      structuredData: null,
      findings: 'Ancien compte rendu.',
      impression: '',
      recommendations: null,
      block,
    })
    expect(out.structuredData).toBeNull()
    expect(out.findings).toContain('Ancien compte rendu.')
    expect(out.findings).toContain('Pulmonary nodule')
  })

  it('an empty section does not gain a leading blank line', () => {
    const out = applyExternalAiFindings({
      structuredData: { ...STRUCTURED, results: '' },
      findings: '', impression: '', recommendations: null, block,
    })
    expect(out.structuredData!.results.startsWith('---')).toBe(true)
  })
})

describe('27. accepted findings reach every output', () => {
  it('the canonical section resolver sees them', () => {
    const out = applyExternalAiFindings({
      structuredData: STRUCTURED, findings: '', impression: '', recommendations: null, block,
    })
    const sections = getReportSections({ structuredData: out.structuredData })
    expect(sections.results).toContain('Pulmonary nodule')
  })

  it('the export model — the one source for PDF, DOCX, print and delivery — carries them', () => {
    const out = applyExternalAiFindings({
      structuredData: STRUCTURED, findings: '', impression: '', recommendations: null, block,
    })
    const model = buildReportExportModel({
      report: {
        status: 'draft',
        findings: out.findings,
        impression: 'Pas de foyer.',
        structuredData: out.structuredData ?? undefined,
        createdAt: '2026-08-10T09:00:00.000Z',
      },
      study: null, patient: null, clinic: null, radiologist: null,
    })

    const rendered = JSON.stringify(model)
    expect(rendered).toContain('Pulmonary nodule')
  })

  it('the old behaviour would have lost them — legacy column alone is not rendered', () => {
    // Writing ONLY the legacy column on a structured report: the canonical
    // resolver reads structured_data and never sees the appended text.
    const sections = getReportSections({
      structuredData: STRUCTURED,
      findings: `${STRUCTURED.results}\n\n${block}`,
    })
    expect(sections.results).not.toContain('Pulmonary nodule')
  })
})

describe('the block itself', () => {
  it('is attributed to the vendor and clearly external', () => {
    expect(block).toContain('External AI Suggestions')
    expect(block).toContain('Vendor')
    expect(block).toContain('Model')
    expect(block).toContain('v2.1')
  })

  it('omits the version when there is none', () => {
    expect(buildExternalAiBlock('V', 'M', null, ACCEPTED)).not.toContain(' v')
  })

  it('renders severity, location, confidence and recommendation', () => {
    expect(block).toContain('[MODERATE]')
    expect(block).toContain('right upper lobe')
    expect(block).toContain('confidence: 87%')
    expect(block).toContain('CT follow-up in 3 months')
  })

  it('omits confidence when the vendor did not report one', () => {
    const b = buildExternalAiBlock('V', 'M', null, [{ finding_label: 'X', confidence: null }])
    expect(b).not.toContain('confidence')
  })
})

// ─── 28-29. The action's guards, verified at the source ───────────────────────

const ACTION = readFileSync(
  new URL('../actions/external-ai.ts', import.meta.url), 'utf8',
)
const APPLY_FN = ACTION.slice(ACTION.indexOf('export async function applyAcceptedFindingsToReport'))

describe('28. the version snapshot is written correctly', () => {
  it('goes through the shared R0.2 writer instead of a hand-rolled insert', () => {
    expect(APPLY_FN).toContain('createReportVersion')
    expect(APPLY_FN).not.toMatch(/from\('report_versions'\)[\s\S]{0,200}\.insert\(/)
  })

  it('carries clinic_id and the structured payload', () => {
    expect(APPLY_FN).toContain('clinicId:')
    expect(APPLY_FN).toContain('structuredData:  currentStructured')
  })

  it('a snapshot failure aborts the write', () => {
    expect(APPLY_FN).toMatch(/if \(snapshot\.error\) return \{ error: snapshot\.error \}/)
    // …and it is checked BEFORE the report update.
    expect(APPLY_FN.indexOf('snapshot.error')).toBeLessThan(APPLY_FN.indexOf("from('reports')\n    .update"))
  })

  it('every Supabase read is error-checked', () => {
    for (const guard of ['reportError', 'findingsError', 'aiResultError', 'updateError']) {
      expect(APPLY_FN, guard).toContain(guard)
    }
  })
})

describe('29. a finalized report rejects the append', () => {
  it('is refused before anything is written', () => {
    expect(APPLY_FN).toContain("report.status === 'finalized'")
    expect(APPLY_FN.indexOf("=== 'finalized'")).toBeLessThan(APPLY_FN.indexOf('createReportVersion'))
  })

  it('still requires a report-writing role', () => {
    expect(APPLY_FN).toContain('MANAGE_ROLES.includes')
  })
})

describe('no parallel content model', () => {
  it('the action writes structured_data and findings, and no new column', () => {
    const update = APPLY_FN.slice(APPLY_FN.indexOf(".from('reports')\n    .update"))
    expect(update).toContain('findings: applied.findings')
    expect(update).toContain('structured_data: applied.structuredData')
    for (const invented of ['external_findings', 'ai_findings_text', 'suggestions_column']) {
      expect(update).not.toContain(invented)
    }
  })
})
