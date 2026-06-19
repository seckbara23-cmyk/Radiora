// F13 — Exam Master Catalog data layer.
//
// The global catalog ships in code (src/config/exam-catalog.ts) so the app works
// before the DB migration is applied. Clinic-specific custom exams live in the
// `exam_catalog` table and are merged on top. If the table is missing or the
// query fails, we degrade to the shipped catalog rather than break report flows.

import { createClient } from '@/lib/supabase/server'
import { EXAM_CATALOG } from '@/config/exam-catalog'
import {
  MODALITY_ORDER,
  type ExamCatalogEntry,
  type ExamModality,
  type SpecialLayout,
} from '@/types/exam'

const SELECT_COLS =
  'id, clinic_id, modality, title, exam_type, default_technique, normal_template_id, special_layout, is_active, sort_order'

function toEntry(row: Record<string, unknown>): ExamCatalogEntry {
  return {
    id:               row.id as string,
    clinicId:         (row.clinic_id as string | null) ?? null,
    modality:         row.modality as ExamModality,
    title:            row.title as string,
    examType:         row.exam_type as string,
    defaultTechnique: (row.default_technique as string) ?? '',
    normalTemplateId: (row.normal_template_id as string | null) ?? null,
    specialLayout:    (row.special_layout as SpecialLayout | null) ?? undefined,
    isActive:         (row.is_active as boolean) ?? true,
    sortOrder:        (row.sort_order as number) ?? 0,
    isCustom:         (row.clinic_id as string | null) != null,
  }
}

/**
 * The full exam catalog visible to the current user: shipped globals overlaid
 * with the clinic's own rows. A clinic row with the same examType overrides the
 * global one (lets a site tweak a default technique or deactivate an exam).
 */
export async function getExamCatalog(opts?: { activeOnly?: boolean }): Promise<ExamCatalogEntry[]> {
  const byKey = new Map<string, ExamCatalogEntry>()
  for (const e of EXAM_CATALOG) byKey.set(e.examType, { ...e, isActive: true })

  // RLS already scopes rows to global (null) + this clinic; we only need clinic
  // rows here since globals come from config. Best-effort: tolerate a missing table.
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('exam_catalog')
      .select(SELECT_COLS)
      .not('clinic_id', 'is', null)
    if (!error && data) {
      for (const row of data) {
        const e = toEntry(row)
        byKey.set(e.examType, e)
      }
    }
  } catch {
    // table not migrated yet — fall back to the shipped global catalog
  }

  let entries = [...byKey.values()]
  if (opts?.activeOnly) entries = entries.filter((e) => e.isActive !== false)

  return entries.sort((a, b) => {
    const m = MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality)
    if (m !== 0) return m
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, 'fr')
  })
}

/** Catalog grouped by modality, in display order, for the picker UI. */
export async function getExamCatalogByModality(
  opts?: { activeOnly?: boolean },
): Promise<Array<{ modality: ExamModality; exams: ExamCatalogEntry[] }>> {
  const all = await getExamCatalog(opts)
  return MODALITY_ORDER.map((modality) => ({
    modality,
    exams: all.filter((e) => e.modality === modality),
  })).filter((g) => g.exams.length > 0)
}

/** Resolve a single exam by its stable key (global or clinic custom). */
export async function getExam(examType: string): Promise<ExamCatalogEntry | null> {
  const all = await getExamCatalog()
  return all.find((e) => e.examType === examType) ?? null
}
