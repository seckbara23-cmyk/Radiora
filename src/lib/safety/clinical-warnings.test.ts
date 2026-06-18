import { describe, it, expect } from 'vitest'
import { analyzeClinicalSafety, extractMeasurements } from '@/lib/safety/clinical-warnings'
import type { StructuredReportData } from '@/types/report'

// F10 #6 — advisory clinical safety warnings (heuristics, not hard blocks).

const LONG = 'Texte clinique substantiel décrivant les résultats de l\'examen en détail.'

function structured(over: Partial<StructuredReportData> = {}): StructuredReportData {
  return {
    language: 'fr',
    examType: 'echographie_abdominale',
    examTitle: 'ÉCHOGRAPHIE ABDOMINALE',
    patient: { name: 'TEST', age: '40 ans', sex: 'Féminin' },
    indication: LONG,
    technique: LONG,
    results: LONG,
    conclusion: LONG,
    ...over,
  }
}

describe('extractMeasurements', () => {
  it('extracts measurements with units', () => {
    const m = extractMeasurements('Nodule de 12 mm et kyste de 3,5 cm, sténose à 45 %.')
    expect(m).toContain('12 mm')
    expect(m).toContain('3,5 cm')
    expect(m).toContain('45 %')
  })
})

describe('analyzeClinicalSafety', () => {
  it('warns on an empty required section', () => {
    const w = analyzeClinicalSafety({ structuredData: structured({ conclusion: '' }) })
    expect(w.some((x) => x.type === 'empty_required_section' && x.section === 'conclusion')).toBe(true)
  })

  it('warns when a measurement appears in CONCLUSION but not in RÉSULTATS', () => {
    const w = analyzeClinicalSafety({
      structuredData: structured({
        results: 'Foie de taille normale, contours réguliers, sans lésion focale visible.',
        conclusion: 'Volumineuse masse hépatique de 45 mm à explorer davantage par IRM.',
      }),
    })
    const hit = w.find((x) => x.type === 'measurement_in_conclusion_not_in_results')
    expect(hit).toBeTruthy()
    expect(hit?.detail).toContain('45 mm')
  })

  it('does NOT warn when the conclusion measurement is also in the results', () => {
    const w = analyzeClinicalSafety({
      structuredData: structured({
        results: 'Masse hépatique de 45 mm du segment VII, hypoéchogène, contours irréguliers.',
        conclusion: 'Masse hépatique de 45 mm suspecte, à explorer par IRM hépatique dédiée.',
      }),
    })
    expect(w.some((x) => x.type === 'measurement_in_conclusion_not_in_results')).toBe(false)
  })

  it('warns on heavy automated cleanup drift', () => {
    const raw = 'euh euh alors voilà donc on voit euh une image euh probablement euh sans particularité euh voilà bon alors euh ok.'
    const cleaned = 'Image sans particularité.'
    const w = analyzeClinicalSafety({
      structuredData: structured(),
      rawTranscript: raw,
      cleanedTranscript: cleaned,
    })
    expect(w.some((x) => x.type === 'heavy_cleanup_drift')).toBe(true)
  })
})
