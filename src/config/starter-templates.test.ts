import { describe, it, expect } from 'vitest'
import { STARTER_TEMPLATES } from './starter-templates'

const MODALITIES = ['US', 'CT', 'MRI', 'XR', 'MG']

describe('STARTER_TEMPLATES (Dr ABIBOU BA library)', () => {
  it('ships the full normal-template set', () => {
    // 9 ECHO + 12 SCAN normal templates (TAGT + Scannopelvimétrie excluded → F18).
    expect(STARTER_TEMPLATES.length).toBe(21)
  })

  it('every template has a title, findings and conclusion', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.title.trim().length).toBeGreaterThan(0)
      expect(t.findings.trim().length).toBeGreaterThan(0)
      expect(t.impression.trim().length).toBeGreaterThan(0)
    }
  })

  it('uses known modalities', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(MODALITIES).toContain(t.modality)
    }
  })

  it('has unique exam-type slugs', () => {
    const slugs = STARTER_TEMPLATES.map((t) => t.examType)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('never contains the doctor signature line in clinical content', () => {
    for (const t of STARTER_TEMPLATES) {
      const blob = `${t.indication}\n${t.technique}\n${t.findings}\n${t.impression}`
      expect(blob).not.toMatch(/ABIBOU\s+BA/i)
    }
  })

  it('excludes special table layouts (handled by F18)', () => {
    const titles = STARTER_TEMPLATES.map((t) => t.title.toLowerCase())
    expect(titles.some((x) => x.includes('tagt'))).toBe(false)
    expect(titles.some((x) => x.includes('scannopelvim'))).toBe(false)
  })
})
