// Feature 10 — clinical safety warnings.
//
// Advisory checks surfaced to the radiologist before validation. These are
// heuristics, NOT blockers (the signing gate owns hard blocks); they draw the
// eye to places where the report may be internally inconsistent or
// under-reviewed. Pure and deterministic — no IO, no AI.

import type { SectionConfidence } from '@/types/structuring'
import { assessConfidence } from '@/lib/safety/confidence'
import {
  getReportSections,
  requiredSectionKeys,
  SECTION_LABELS,
  type ReportContentInput,
  type SectionKey,
} from '@/lib/safety/sections'

export type WarningType =
  | 'empty_required_section'
  | 'measurement_in_conclusion_not_in_results'
  | 'finding_in_conclusion_not_in_results'
  | 'low_confidence_section'
  | 'unresolved_review'
  | 'heavy_cleanup_drift'

export type WarningSeverity = 'high' | 'medium'

export interface ClinicalWarning {
  type:     WarningType
  severity: WarningSeverity
  section?: SectionKey
  /** Concrete detail, e.g. the offending measurement(s) or term(s). */
  detail?:  string
}

export interface WarningInput extends ReportContentInput {
  aiConfidence?: SectionConfidence[] | null
  /** Raw vs cleaned transcript, to detect heavy automated rewriting. */
  rawTranscript?:     string | null
  cleanedTranscript?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

// Numeric measurements with a unit: "12 mm", "3,5 cm", "45 %", "20°", "2 cc".
// The trailing guard is a negative look-ahead (not \b) so non-word units like
// "%" and "°" are matched — a literal \b after "%" can never hold (both sides
// are non-word) and would silently drop every percentage/angle measurement.
const MEASUREMENT_RE =
  /\b\d+(?:[.,]\d+)?\s?(?:mm3|cm3|mm³|cm³|mm|cm|ml|cc|m|°|%|millimetres?|centimetres?)(?![a-z0-9])/gi

export function extractMeasurements(text: string): string[] {
  const out = new Set<string>()
  const n = normalize(text)
  let m: RegExpExecArray | null
  MEASUREMENT_RE.lastIndex = 0
  while ((m = MEASUREMENT_RE.exec(n)) !== null) {
    out.add(m[0].replace(/\s+/g, ' ').trim())
  }
  return [...out]
}

// Short / structural words that carry no localizing clinical meaning.
const STOPWORDS = new Set([
  'aspect', 'lesion', 'lesions', 'image', 'images', 'niveau', 'droite', 'gauche',
  'bilateral', 'bilaterale', 'anomalie', 'anomalies', 'presence', 'absence',
  'examen', 'structure', 'structures', 'region', 'plage', 'plages', 'signal',
  'densite', 'taille', 'contours', 'limites', 'visible', 'normal', 'normale',
  'compatible', 'evocateur', 'probable', 'possible', 'suspicion', 'faveur',
  'conclusion', 'resultats', 'sans', 'avec', 'pour', 'dans', 'cette', 'celui',
])

/** Substantive clinical tokens (length ≥ 6, not stopwords), accent-stripped. */
function clinicalTokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 6 && !STOPWORDS.has(w))
}

// ── Analyzer ─────────────────────────────────────────────────────────────────

export function analyzeClinicalSafety(input: WarningInput): ClinicalWarning[] {
  const sections = getReportSections(input)
  const required = requiredSectionKeys(input)
  const warnings: ClinicalWarning[] = []

  // 1. Required sections empty.
  for (const key of required) {
    if (!sections[key]) {
      warnings.push({ type: 'empty_required_section', severity: 'high', section: key, detail: SECTION_LABELS[key] })
    }
  }

  const results    = sections.results
  const conclusion = sections.conclusion

  if (conclusion && results) {
    // 2. Measurements in CONCLUSION absent from RÉSULTATS.
    const resMeasures  = new Set(extractMeasurements(results))
    const conMeasures  = extractMeasurements(conclusion)
    const orphanM      = conMeasures.filter((m) => !resMeasures.has(m))
    if (orphanM.length > 0) {
      warnings.push({
        type: 'measurement_in_conclusion_not_in_results',
        severity: 'high',
        section: 'conclusion',
        detail: orphanM.join(', '),
      })
    }

    // 3. Substantive findings named in CONCLUSION but not in RÉSULTATS.
    const resTokens = new Set(clinicalTokens(results))
    const orphanT   = [...new Set(clinicalTokens(conclusion))].filter((tok) => {
      // present if the results mention the token or a stem of it
      for (const r of resTokens) {
        if (r === tok || r.startsWith(tok.slice(0, 6)) || tok.startsWith(r.slice(0, 6))) return false
      }
      return true
    })
    if (orphanT.length > 0) {
      warnings.push({
        type: 'finding_in_conclusion_not_in_results',
        severity: 'medium',
        section: 'conclusion',
        detail: orphanT.slice(0, 6).join(', '),
      })
    }
  }

  // 4. Low-confidence required sections (final content).
  for (const key of required) {
    if (sections[key] && assessConfidence(sections[key]) === 'low') {
      warnings.push({ type: 'low_confidence_section', severity: 'medium', section: key })
    }
  }

  // 5. Unresolved AI review flags on required sections.
  for (const c of input.aiConfidence ?? []) {
    if (c.reviewRequired && (required as string[]).includes(c.section)) {
      const txt = sections[c.section as SectionKey] ?? ''
      if (assessConfidence(txt) !== 'high') {
        warnings.push({ type: 'unresolved_review', severity: 'medium', section: c.section as SectionKey })
      }
    }
  }

  // 6. Heavy automated rewriting: cleaned transcript much shorter than raw.
  const raw     = (input.rawTranscript ?? '').trim()
  const cleaned = (input.cleanedTranscript ?? '').trim()
  if (raw.length >= 80 && cleaned.length > 0) {
    const dropped = (raw.length - cleaned.length) / raw.length
    if (dropped >= 0.4) {
      warnings.push({
        type: 'heavy_cleanup_drift',
        severity: 'medium',
        detail: `${Math.round(dropped * 100)}%`,
      })
    }
  }

  return warnings
}
