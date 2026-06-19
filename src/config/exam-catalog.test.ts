import { describe, it, expect } from 'vitest'
import { EXAM_CATALOG, slugifyExam, findExam } from '@/config/exam-catalog'
import { MODALITY_ORDER } from '@/types/exam'

// F13 — the exam catalog is reference data the whole app keys off of. These
// invariants must hold or report routing / template linkage silently breaks.

describe('exam catalog', () => {
  it('has a substantial catalog (~95 exams)', () => {
    expect(EXAM_CATALOG.length).toBeGreaterThanOrEqual(80)
  })

  it('every examType key is unique', () => {
    const keys = EXAM_CATALOG.map((e) => e.examType)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every entry has a non-empty title and default technique', () => {
    for (const e of EXAM_CATALOG) {
      expect(e.title.trim().length).toBeGreaterThan(0)
      expect(e.defaultTechnique.trim().length).toBeGreaterThan(0)
    }
  })

  it('uses only known modalities', () => {
    for (const e of EXAM_CATALOG) {
      expect(MODALITY_ORDER).toContain(e.modality)
    }
  })

  it('flags exactly the three special table-based exams (F18)', () => {
    const special = EXAM_CATALOG.filter((e) => e.specialLayout).map((e) => e.specialLayout)
    expect(special.sort()).toEqual(['mammographie', 'scannopelvimetrie', 'tagt'])
  })

  it('slugify is accent- and punctuation-stable', () => {
    expect(slugifyExam('SCANNER CÉRÉBRAL')).toBe('scanner_cerebral')
    expect(slugifyExam("IRM DE L'ÉPAULE")).toBe('irm_de_l_epaule')
    expect(slugifyExam('ÉCHOGRAPHIE OBSTÉTRICALE (T2-T3)')).toBe('echographie_obstetricale_t2_t3')
  })

  it('findExam resolves a known key and rejects an unknown one', () => {
    expect(findExam('scanner_cerebral')?.title).toBe('SCANNER CÉRÉBRAL')
    expect(findExam('does_not_exist')).toBeUndefined()
  })
})
