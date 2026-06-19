import type { SpecialLayout } from './exam'

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
