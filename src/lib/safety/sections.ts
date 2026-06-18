// Feature 10 — report section model shared by the signing gate and warnings.
//
// A report can be in structured HPD mode (structured_data present) or legacy
// 3-field mode. This module resolves either shape into a uniform section map and
// declares which sections are REQUIRED before a report may be signed.

import type { StructuredReportData } from '@/types/report'

export type SectionKey = 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'

export type SectionTextMap = Record<SectionKey, string>

/** Display order, always INDICATION → TECHNIQUE → RÉSULTATS → CONCLUSION → RECOMMANDATIONS. */
export const SECTION_ORDER: SectionKey[] = [
  'indication',
  'technique',
  'results',
  'conclusion',
  'recommendations',
]

/** French labels for messages/UI. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  indication:      'INDICATION',
  technique:       'TECHNIQUE',
  results:         'RÉSULTATS',
  conclusion:      'CONCLUSION',
  recommendations: 'RECOMMANDATIONS',
}

export interface ReportContentInput {
  structuredData?: StructuredReportData | null
  findings?:        string
  impression?:      string
  recommendations?: string | null
}

/**
 * Resolve a report into a uniform section map.
 * Structured mode reads the HPD JSON; legacy mode maps findings→results and
 * impression→conclusion (legacy reports have no indication/technique fields).
 */
export function getReportSections(input: ReportContentInput): SectionTextMap {
  if (input.structuredData) {
    const s = input.structuredData
    return {
      indication:      (s.indication ?? '').trim(),
      technique:       (s.technique ?? '').trim(),
      results:         (s.results ?? '').trim(),
      conclusion:      (s.conclusion ?? '').trim(),
      recommendations: (s.recommendations ?? '').trim(),
    }
  }
  return {
    indication:      '',
    technique:       '',
    results:         (input.findings ?? '').trim(),
    conclusion:      (input.impression ?? '').trim(),
    recommendations: (input.recommendations ?? '').trim(),
  }
}

/**
 * Sections that must be non-empty before signing.
 *  • Structured HPD reports: all four clinical sections (INDICATION, TECHNIQUE,
 *    RÉSULTATS, CONCLUSION).
 *  • Legacy reports: RÉSULTATS + CONCLUSION (they have no indication/technique).
 * RECOMMANDATIONS is always optional.
 */
export function requiredSectionKeys(input: ReportContentInput): SectionKey[] {
  return input.structuredData
    ? ['indication', 'technique', 'results', 'conclusion']
    : ['results', 'conclusion']
}

export function isStructured(input: ReportContentInput): boolean {
  return Boolean(input.structuredData)
}
