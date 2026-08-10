import type { SpecialLayout } from './exam'
import type { SectionKey } from '@/lib/safety/sections'

/**
 * R2.7C — who authored a section, PERSISTED alongside the report.
 *
 * Before R2.7C provenance existed only in memory, so a reload had to guess it:
 * every non-empty section was assumed to be the radiologist's. That was safe
 * (nothing was ever overwritten) but untrue — the "Modifié par vous" badge
 * appeared on text the engine had written, and the doctor could not tell their
 * own words from the machine's after coming back to a draft.
 *
 * This is deliberately a THREE-value vocabulary, not the router's finer-grained
 * `SectionProvenance`. The only question it answers is the one that decides
 * authority: may a later structuring pass write here?
 */
export type SectionProvenanceValue =
  /** Typed or edited by the radiologist. Outranks everything; never overwritten. */
  | 'physician_edit'
  /** Derived from the doctor's dictated words by the structuring engine. */
  | 'dictation'
  /** Machine-authored boilerplate (the acquisition-protocol paragraph). */
  | 'template'

export type ReportStatus = 'draft' | 'in_review' | 'finalized' | 'amended'

export interface StructuredPatient {
  name: string
  age: string
  sex: string
  serviceOrWard?: string
}

/**
 * F18 — filled state of a special structured exam form (Mammographie,
 * Scannopelvimétrie, TAGT). `values` is a flat map keyed by `${rowKey}__${colKey}`
 * (single-column forms use the column key 'valeur'). The schema that gives these
 * keys meaning lives in src/config/special-forms.ts — only measurements typed by
 * the radiologist are stored here; nothing is ever AI-generated.
 */
export interface SpecialFormState {
  layout: SpecialLayout
  values: Record<string, string>
}

/**
 * HPD-format structured report content.
 * The AI generates this JSON; the application renders it — never the reverse.
 * Keys map directly to the official Hôpital Principal de Dakar report sections.
 */
export interface StructuredReportData {
  language:    'fr' | 'en'
  examType:    string        // snake_case key, e.g. scanner_cerebral
  examTitle:   string        // display label, e.g. "SCANNER CÉRÉBRAL"
  patient:     StructuredPatient
  indication:  string        // INDICATION section
  technique:   string        // TECHNIQUE section
  results:     string        // RÉSULTATS section (replaces legacy "findings")
  conclusion:  string        // EN CONCLUSION section (replaces legacy "impression")
  recommendations?: string   // RECOMMANDATIONS section (optional)
  specialForm?: SpecialFormState  // F18 — measurement table for special exams; RÉSULTATS rendered from it
  dictationTranscript?: string
  generatedAt?: string
  /**
   * R2.7C — per-section authorship. Optional and absent on every report saved
   * before R2.7C, which is why readers MUST fall back to the conservative
   * "assume the radiologist owns it" rule rather than treating a missing entry
   * as 'dictation'. Stored inside the existing `reports.structured_data` jsonb;
   * no schema change.
   */
  sectionProvenance?: Partial<Record<SectionKey, SectionProvenanceValue>>
}

export interface Report {
  id:              string
  studyId:         string
  patientId:       string
  clinicId:        string
  authorId:        string
  status:          ReportStatus
  findings:        string        // legacy — kept for backward compat; mirrors structuredData.results
  impression:      string        // legacy — kept for backward compat; mirrors structuredData.conclusion
  recommendations?: string
  aiDraft?:        string
  signedAt?:       string
  createdAt:       string
  updatedAt:       string
  structuredData?: StructuredReportData  // present on reports using the HPD structured editor
  examType?:       string
}
