import { describe, it, expect } from 'vitest'
import {
  detectSectionDuplication,
  repairSectionDuplication,
} from '@/lib/safety/section-duplication'
import type { SectionTextMap } from '@/lib/safety/sections'

// R2.6 — duplication is a clause-level question, never a word-level one.
// Radiology repeats its vocabulary constantly; flagging that would bury the
// real cases.

const sections = (partial: Partial<SectionTextMap>): SectionTextMap => ({
  indication: '', technique: '', results: '', conclusion: '', recommendations: '',
  ...partial,
})

describe('detection', () => {
  it('7. the same clause in two sections is an exact duplicate', () => {
    const found = detectSectionDuplication(sections({
      indication: 'Traumatisme crânien.',
      results:    'Traumatisme crânien.',
    }))
    const exact = found.filter((f) => f.kind === 'exact')
    expect(exact).toHaveLength(1)
    expect(exact[0].sections).toEqual(['indication', 'results'])
  })

  it('ignores case, accents, punctuation and spacing', () => {
    const found = detectSectionDuplication(sections({
      indication: 'Traumatisme crânien',
      results:    'TRAUMATISME CRANIEN.',
    }))
    expect(found.some((f) => f.kind === 'exact')).toBe(true)
  })

  it('a technique sentence repeated in findings is caught', () => {
    const line = 'Acquisition hélicoïdale après injection de produit de contraste iodé.'
    const found = detectSectionDuplication(sections({ technique: line, results: line }))
    expect(found.some((f) => f.kind === 'exact' && f.sections[0] === 'technique')).toBe(true)
  })

  it('findings copied wholesale into conclusion is caught', () => {
    const line = 'Nodule hépatique de 12 mm dans le segment VII sans autre anomalie.'
    const found = detectSectionDuplication(sections({ results: line, conclusion: line }))
    expect(found.some((f) => f.kind === 'exact')).toBe(true)
  })

  it('a rewording is a near duplicate', () => {
    const found = detectSectionDuplication(sections({
      results:    'Nodule hépatique de 12 mm dans le segment VII du foie.',
      conclusion: 'Nodule hépatique de 12 mm du segment VII dans le foie.',
    }))
    expect(found.some((f) => f.kind === 'near')).toBe(true)
  })

  it('25. shared terminology alone is not duplication', () => {
    const found = detectSectionDuplication(sections({
      indication: 'Bilan de douleur abdominale droite.',
      results:    'Le foie est de taille normale et de contours réguliers.',
      conclusion: 'Absence de lésion hépatique suspecte.',
    }))
    expect(found.filter((f) => f.kind === 'exact' || f.kind === 'near')).toEqual([])
  })

  it('two genuinely different findings sharing a lesion word are not duplicates', () => {
    const found = detectSectionDuplication(sections({
      results:    'Lésion du segment VII mesurant 12 mm.',
      conclusion: 'Lésion à contrôler par IRM hépatique dans six mois.',
    }))
    expect(found.filter((f) => f.kind === 'exact' || f.kind === 'near')).toEqual([])
  })

  it('only the duplicated clause is reported, not the whole section', () => {
    const found = detectSectionDuplication(sections({
      indication: 'Traumatisme crânien.',
      results:    'Traumatisme crânien. Petite hyperdensité frontale droite.',
    }))
    const exact = found.filter((f) => f.kind === 'exact')
    expect(exact).toHaveLength(1)
    expect(exact[0].clause).toBe('Traumatisme crânien.')
  })
})

describe('8-10. provenance-gated repair', () => {
  it('8. removes the fallback copy when provenance is unambiguous', () => {
    const result = repairSectionDuplication({
      sections: sections({
        indication: 'Traumatisme crânien.',
        results:    'Traumatisme crânien. Petite hyperdensité frontale droite.',
      }),
      provenance: { indication: 'explicit_header', results: 'inferred' },
    })

    expect(result.sections.indication).toBe('Traumatisme crânien.')
    expect(result.sections.results).toBe('Petite hyperdensité frontale droite.')
    expect(result.removed).toEqual([
      { section: 'results', keptIn: 'indication', clause: 'Traumatisme crânien.' },
    ])
    expect(result.review).toEqual([])
  })

  it('9. never removes anything from a physician-edited section', () => {
    const input = sections({
      indication: 'Traumatisme crânien.',
      results:    'Traumatisme crânien.',
    })
    const result = repairSectionDuplication({
      sections: input,
      provenance: { indication: 'explicit_header', results: 'inferred' },
      locked: ['results'],
    })

    expect(result.sections.results).toBe('Traumatisme crânien.')
    expect(result.removed).toEqual([])
    expect(result.review).toHaveLength(1)
  })

  it('a physician-edited section is protected even when it is the authoritative one', () => {
    const result = repairSectionDuplication({
      sections: sections({ results: 'Nodule hépatique.', conclusion: 'Nodule hépatique.' }),
      provenance: { results: 'physician_edit', conclusion: 'inferred' },
      locked: ['results'],
    })
    expect(result.removed).toEqual([])
    expect(result.review).toHaveLength(1)
  })

  it('10. ambiguous provenance preserves both and raises review', () => {
    const result = repairSectionDuplication({
      sections: sections({ results: 'Nodule hépatique.', conclusion: 'Nodule hépatique.' }),
      // Both explicitly dictated: the doctor may well have meant it.
      provenance: { results: 'explicit_header', conclusion: 'explicit_header' },
    })
    expect(result.sections.results).toBe('Nodule hépatique.')
    expect(result.sections.conclusion).toBe('Nodule hépatique.')
    expect(result.removed).toEqual([])
    expect(result.review).toHaveLength(1)
  })

  it('two fallback copies are also ambiguous — neither is provably wrong', () => {
    const result = repairSectionDuplication({
      sections: sections({ results: 'Nodule hépatique.', conclusion: 'Nodule hépatique.' }),
      provenance: { results: 'inferred', conclusion: 'continuation' },
    })
    expect(result.removed).toEqual([])
    expect(result.review).toHaveLength(1)
  })

  it('the protocol template belongs in technique, so the copy elsewhere goes', () => {
    const template = 'Scanner réalisé en acquisition volumique avec reconstructions multiplanaires.'
    const result = repairSectionDuplication({
      sections: sections({ technique: template, results: `${template} Foie normal.` }),
      provenance: { technique: 'auto_filled', results: 'inferred' },
    })
    expect(result.sections.technique).toBe(template)
    expect(result.sections.results).toBe('Foie normal.')
  })

  it('shared vocabulary is never repaired away', () => {
    const input = sections({
      indication: 'Bilan de douleur abdominale droite.',
      results:    'Le foie est de taille normale et de contours réguliers.',
    })
    const result = repairSectionDuplication({
      sections: input,
      provenance: { indication: 'explicit_header', results: 'inferred' },
    })
    expect(result.sections).toEqual(input)
    expect(result.removed).toEqual([])
  })

  it('repair never empties a section it cannot fully resolve', () => {
    // The only clause in results is the duplicate; removing it empties results,
    // which is correct — the content lives in indication.
    const result = repairSectionDuplication({
      sections: sections({ indication: 'Traumatisme crânien.', results: 'Traumatisme crânien.' }),
      provenance: { indication: 'explicit_header', results: 'inferred' },
    })
    expect(result.sections.results).toBe('')
    expect(result.sections.indication).toBe('Traumatisme crânien.')
  })
})
