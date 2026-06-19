// F13 — Exam Master Catalog.
//
// A normalized catalog of the radiology exams offered by the pilot site
// (Dr Abibou BA — Senegal), derived from "LISTE DES EXAMENS.xlsx". Every exam
// carries its modality, canonical French title, a stable snake_case key, a
// default technique paragraph and — for the handful of exams that use a
// table-based report (F18) — a special-layout flag.
//
// The canonical list lives in code (src/config/exam-catalog.ts) so it ships and
// version-controls with the app. The `exam_catalog` DB table mirrors it and
// lets a clinic add its own exams; clinic rows are merged on top of the globals.

export type ExamModality = 'US' | 'CT' | 'MRI' | 'XR' | 'MG'

/** Exams that render as a structured table instead of free text (see F18). */
export type SpecialLayout = 'scannopelvimetrie' | 'tagt' | 'mammographie'

export interface ExamCatalogEntry {
  /** Stable snake_case identifier, unique across the catalog. */
  examType: string
  modality: ExamModality
  /** Canonical French title, e.g. "SCANNER CÉRÉBRAL". */
  title: string
  /** Default TECHNIQUE paragraph; the radiologist always edits before signing. */
  defaultTechnique: string
  /** Set when the exam uses a table-based structured form. */
  specialLayout?: SpecialLayout
  /** True for clinic-added exams (not part of the shipped global catalog). */
  isCustom?: boolean
  /** Present for clinic custom rows persisted in the DB. */
  id?: string
  clinicId?: string | null
  /** Optional link to a seeded normal-findings template (F16). */
  normalTemplateId?: string | null
  isActive?: boolean
  sortOrder?: number
}

export const MODALITY_LABELS: Record<ExamModality, { fr: string; en: string }> = {
  US:  { fr: 'Échographie',  en: 'Ultrasound' },
  CT:  { fr: 'Scanner',      en: 'CT' },
  MRI: { fr: 'IRM',          en: 'MRI' },
  XR:  { fr: 'Radiographie', en: 'X-ray' },
  MG:  { fr: 'Mammographie', en: 'Mammography' },
}

export const MODALITY_ORDER: ExamModality[] = ['US', 'CT', 'MRI', 'XR', 'MG']
