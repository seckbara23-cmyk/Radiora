import { describe, it, expect } from 'vitest'
import { detectSelfCorrections, resolveCorrectionTarget } from '@/lib/ai/self-correction'
import { runStructuring } from '@/lib/ai/structuring-engine'

// R2.6 — corrections whose target is in a PREVIOUS sentence.
//
// Before R2.6 "…12 mm. Je corrige, 14 mm." appended the replacement, leaving
// both measurements in the report; "Présence d'épanchement. Je corrige, absence
// d'épanchement." left both polarities standing. Both are fixed here, and both
// refuse to act when the target is ambiguous.

const structured = (raw: string) =>
  runStructuring({
    rawTranscript: raw, modality: 'CT', bodyPart: 'thorax',
    patientName: '', patientAge: '', patientSex: '', locale: 'fr',
  })

describe('14. measurement corrections', () => {
  it('replaces only the measurement, keeping lesion identity', () => {
    const { corrected, events } = detectSelfCorrections(
      'Nodule du lobe supérieur droit mesurant 12 mm. Je corrige, 14 mm.',
    )
    expect(corrected).toBe('Nodule du lobe supérieur droit mesurant 14 mm.')
    expect(corrected).toContain('lobe supérieur')
    expect(corrected).toContain('droit')
    expect(corrected).not.toContain('12 mm')

    const applied = events.filter((e) => e.applied)
    expect(applied).toHaveLength(1)
    expect(applied[0].removed).toBe('12 mm')
    expect(applied[0].kept).toBe('14 mm')
  })

  it('works after a standalone retraction too', () => {
    const { corrected } = detectSelfCorrections(
      'Nodule du lobe supérieur droit mesurant 12 mm. Non. 14 mm.',
    )
    expect(corrected).toBe('Nodule du lobe supérieur droit mesurant 14 mm.')
  })

  it('refuses when two measurements could be the target', () => {
    const raw = 'Nodule de 12 mm et kyste de 8 mm. Je corrige, 14 mm.'
    const { corrected, events } = detectSelfCorrections(raw)
    // Nothing deleted: both original measurements survive.
    expect(corrected).toContain('12 mm')
    expect(corrected).toContain('8 mm')
    expect(events.some((e) => e.applied === false)).toBe(true)
  })
})

describe('15-17. measurement formats survive', () => {
  const cases: Array<[string, string]> = [
    ['3.5 cm',    'Lésion hépatique mesurant 3.5 cm du segment VII.'],
    ['3,5 cm',    'Lésion hépatique mesurant 3,5 cm du segment VII.'],
    ['12 x 8 mm', 'Nodule pulmonaire de 12 x 8 mm du lobe supérieur droit.'],
    ['12 × 8 mm', 'Nodule pulmonaire de 12 × 8 mm du lobe supérieur droit.'],
  ]

  for (const [label, raw] of cases) {
    it(`${label} survives structuring untouched`, () => {
      expect(detectSelfCorrections(raw).corrected).toContain(label)
      expect(structured(raw).structured.results).toContain(label)
    })
  }

  it('a decimal measurement can itself be corrected', () => {
    const { corrected } = detectSelfCorrections(
      'Lésion hépatique mesurant 3,5 cm. Je corrige, 4,2 cm.',
    )
    expect(corrected).toBe('Lésion hépatique mesurant 4,2 cm.')
  })

  it('a paired measurement can be corrected as a unit', () => {
    const { corrected } = detectSelfCorrections(
      'Nodule pulmonaire de 12 x 8 mm. Je corrige, 14 x 9 mm.',
    )
    expect(corrected).toContain('14 x 9 mm')
    expect(corrected).not.toContain('12 x 8')
  })
})

describe('18-19. laterality corrections', () => {
  it('changes the laterality of the one lesion described', () => {
    const { corrected, events } = detectSelfCorrections(
      'Lésion rénale droite. Je corrige, gauche.',
    )
    expect(corrected).toBe('Lésion rénale gauche.')
    expect(events.filter((e) => e.applied)).toHaveLength(1)
  })

  it('never changes another lesion’s laterality', () => {
    const raw = 'Lésion rénale droite et kyste hépatique gauche. Je corrige, gauche.'
    const { corrected, events } = detectSelfCorrections(raw)
    // Two candidates → refuse. Both lesions keep the laterality dictated.
    expect(corrected).toContain('rénale droite')
    expect(corrected).toContain('hépatique gauche')
    expect(events.some((e) => e.applied === false)).toBe(true)
  })

  it('leaves the rest of the clause exactly as dictated', () => {
    const { corrected } = detectSelfCorrections(
      'Volumineuse masse surrénalienne droite de découverte fortuite. Je corrige, gauche.',
    )
    expect(corrected).toContain('Volumineuse masse surrénalienne gauche')
    expect(corrected).toContain('découverte fortuite')
  })
})

describe('20. negation corrections preserve polarity', () => {
  it('a corrected polarity replaces the clause — it does not sit beside it', () => {
    const { corrected } = detectSelfCorrections(
      "Présence d'épanchement pleural. Je corrige, absence d'épanchement pleural.",
    )
    // Capitalised, because the replacement now opens the sentence.
    expect(corrected).toBe("Absence d'épanchement pleural.")
    expect(corrected.toLowerCase()).not.toContain("présence d'épanchement")
  })

  it('an uncorrected negation is never inverted', () => {
    const raw = "Pas d'hémorragie intracrânienne. Pas de fracture."
    expect(detectSelfCorrections(raw).corrected).toBe(raw)
    const out = structured(raw).structured
    expect(out.results).toContain("Pas d'hémorragie")
    expect(out.results).toContain('Pas de fracture')
  })

  it('negation survives the whole pipeline including section routing', () => {
    const out = structured(
      "Résultats : pas d'épanchement pleural. Absence de pneumothorax. Ni de fracture costale.",
    ).structured
    expect(out.results).toContain("pas d'épanchement")
    expect(out.results).toContain('Absence de pneumothorax')
    expect(out.results).toContain('Ni de fracture')
  })
})

describe('21-22. uncertainty is never strengthened', () => {
  const HEDGES = [
    'possible', 'probable', 'compatible avec', 'évoquant', 'suspect',
    'ne peut être exclu', 'vraisemblablement',
  ]

  it('every hedge survives the pipeline verbatim', () => {
    const raw =
      "Résultats : lésion possible du segment VII, probable angiome, aspect compatible avec un kyste biliaire, " +
      "évoquant une origine bénigne, nodule suspect, un processus tumoral ne peut être exclu."
    const out = structured(raw).structured
    for (const hedge of HEDGES.filter((h) => raw.includes(h))) {
      expect(out.results, hedge).toContain(hedge)
    }
  })

  it('"compatible avec" is never promoted to a diagnosis', () => {
    const out = structured(
      'Conclusion : aspect compatible avec une pneumopathie infectieuse.',
    ).structured
    expect(out.conclusion).toContain('compatible avec')
    expect(out.conclusion.toLowerCase()).not.toContain('diagnostic de')
  })

  it('"possible" is never promoted to "présence de"', () => {
    const out = structured('Résultats : possible fracture de l’arc antérieur.').structured
    expect(out.results).toContain('possible')
    expect(out.results.toLowerCase()).not.toMatch(/présence de fracture/)
  })
})

describe('resolveCorrectionTarget is preservation-first', () => {
  it('reports ambiguity rather than guessing', () => {
    expect(resolveCorrectionTarget('Nodule de 12 mm et kyste de 8 mm', '14 mm'))
      .toEqual({ status: 'ambiguous', reason: 'multiple_measurements' })
    expect(resolveCorrectionTarget('Lésion droite et kyste gauche', 'gauche'))
      .toEqual({ status: 'ambiguous', reason: 'multiple_laterality' })
  })

  it('falls back to a whole-clause replacement when there is no target', () => {
    expect(resolveCorrectionTarget('Foie homogène', 'rate homogène').status).toBe('clause')
  })

  it('never invents a target that is not there', () => {
    expect(resolveCorrectionTarget('Foie homogène', '14 mm').status).toBe('clause')
  })
})

describe('the R0 preservation guarantees still hold', () => {
  it('a multi-finding clause is never deleted by a correction', () => {
    const raw = 'Foie normal, pas de lésion focale, vésicule alithiasique. Je corrige, vésicule lithiasique.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toContain('Foie normal')
    expect(corrected).toContain('pas de lésion focale')
    expect(events.some((e) => e.applied === false)).toBe(true)
  })

  it('an answer to a question is not a retraction', () => {
    const raw = 'Épanchement pleural ? Non. Fine lame gauche.'
    const { corrected } = detectSelfCorrections(raw)
    expect(corrected).toContain('Épanchement pleural ?')
  })

  it('"correction de scoliose" is surgical history, not a marker', () => {
    const raw = 'Antécédent de correction de scoliose par arthrodèse.'
    expect(detectSelfCorrections(raw).corrected).toBe(raw)
  })
})
