import { describe, it, expect } from 'vitest'
import { detectSelfCorrections, resolveCorrectionTarget } from '@/lib/ai/self-correction'
import { splitClauses } from '@/lib/ai/sentences'

// R2.7C — the correction-recognition matrix.
//
// Each row here is a transcript shape that the R2.7C audit MEASURED failing
// against the deployed engine: the marker was detected, the target was present
// and unique, and the correction was refused anyway — leaving "8 mm, je corrige
// 9 mm" in RÉSULTATS. Re-introducing any one of the causes turns its row red.

const corrected = (raw: string) => detectSelfCorrections(raw).corrected
const events    = (raw: string) => detectSelfCorrections(raw).events

describe('A — measurement vocabulary the engine must recognise', () => {
  const LESION = "Petite lésion hypodense frontale droite mesurant"

  const cases: Array<{ name: string; raw: string; gone: string; kept: string }> = [
    {
      name: 'abbreviated unit, cross-sentence',
      raw:  `${LESION} 8 mm. Je corrige, 9 mm.`,
      gone: '8 mm', kept: '9 mm',
    },
    {
      name: 'abbreviated unit, inline',
      raw:  `${LESION} 8 mm, je corrige 9 mm.`,
      gone: '8 mm', kept: '9 mm',
    },
    {
      name: 'spelled-out unit',
      raw:  `${LESION} 8 millimètres, je corrige 9 millimètres.`,
      gone: '8 millimètres', kept: '9 millimètres',
    },
    {
      name: 'spelled-out number AND unit',
      raw:  `${LESION} huit millimètres, je corrige neuf millimètres.`,
      gone: 'huit millimètres', kept: 'neuf millimètres',
    },
    {
      name: 'compound spelled number',
      raw:  `${LESION} douze millimètres, je corrige quatorze millimètres.`,
      gone: 'douze millimètres', kept: 'quatorze millimètres',
    },
    {
      name: 'restated value ("elle mesure 9 mm")',
      raw:  `${LESION} 8 mm. Je corrige, elle mesure 9 mm.`,
      gone: '8 mm', kept: '9 mm',
    },
    {
      name: 'trailing ellipsis (U+2026)',
      raw:  `${LESION} 8 mm, je corrige 9 mm…`,
      gone: '8 mm', kept: '9 mm',
    },
    {
      name: 'decimal value with a comma separator',
      raw:  `${LESION} 3,5 cm, je corrige 4,2 cm.`,
      gone: '3,5 cm', kept: '4,2 cm',
    },
    {
      name: 'paired measurement',
      raw:  'Nodule pulmonaire de 12 x 8 mm, je corrige 14 x 9 mm.',
      gone: '12 x 8 mm', kept: '14 x 9 mm',
    },
  ]

  for (const c of cases) {
    it(`${c.name}: ${c.gone} → ${c.kept}`, () => {
      const out = corrected(c.raw)
      expect(out).toContain(c.kept)
      expect(out).not.toContain(c.gone)
      const applied = events(c.raw).filter((e) => e.applied)
      expect(applied).toHaveLength(1)
      // On an applied targeted correction, `removed`/`kept` are the two VALUES
      // that were swapped, not the whole clauses.
      expect(applied[0].removed).toBe(c.gone)
      expect(applied[0].kept).toBe(c.kept)
    })
  }

  it('the continuation after the new value is never dropped', () => {
    const out = corrected(
      'Lésion frontale droite mesurant 8 mm, je corrige 9 mm, à corréler au contexte clinique.',
    )
    expect(out).toBe('Lésion frontale droite mesurant 9 mm, à corréler au contexte clinique.')
  })

  it('the corrected value keeps the doctor’s own wording — no unit is normalised', () => {
    // "neuf millimètres" must NOT be rewritten as "9 mm": that would be the
    // engine putting its own words into a clinical section.
    const out = corrected('Lésion de huit millimètres, je corrige neuf millimètres.')
    expect(out).toContain('neuf millimètres')
    expect(out).not.toContain('9 mm')
  })
})

describe('A — laterality and negation corrections', () => {
  it('laterality: gauche → droite, with provenance', () => {
    const raw = 'Lésion frontale gauche. Je corrige, droite.'
    expect(corrected(raw)).toBe('Lésion frontale droite.')
    const [e] = events(raw)
    expect(e.applied).toBe(true)
    expect(e.removed).toBe('gauche')
    expect(e.kept).toBe('droite')
  })

  it('laterality carrying a continuation', () => {
    expect(corrected('Lésion rénale droite. Je corrige, gauche, de découverte fortuite.'))
      .toBe('Lésion rénale gauche, de découverte fortuite.')
  })

  it('negation reversal replaces the finding rather than sitting beside it', () => {
    const raw = "Pas d'épanchement pleural. Je corrige, petit épanchement pleural droit."
    const out = corrected(raw)
    expect(out).toBe('Petit épanchement pleural droit.')
    expect(out).not.toContain("Pas d'épanchement")
    expect(events(raw)[0].applied).toBe(true)
  })

  it('an unretracted negation is never inverted', () => {
    const raw = "Pas d'hémorragie intracrânienne. Pas d'effet de masse."
    expect(corrected(raw)).toBe(raw)
    expect(events(raw)).toHaveLength(0)
  })
})

describe('C — the target is the nearest clause, and ambiguity still refuses', () => {
  it('an unrelated measurement several clauses back is not a competing target', () => {
    // This is the production shape: four findings in one comma-run.
    const raw =
      "Coupes de 5 mm, pas d'effet de masse, lésion frontale droite mesurant 8 mm, je corrige 9 mm."
    const out = corrected(raw)
    expect(out).toContain('9 mm')
    expect(out).toContain('Coupes de 5 mm') // the earlier measurement is untouched
    expect(out).not.toContain('8 mm')
  })

  it('two candidates INSIDE the nearest clause still refuse', () => {
    const raw = 'Nodule de 12 mm et kyste de 8 mm. Je corrige, 14 mm.'
    const out = corrected(raw)
    expect(out).toContain('12 mm')
    expect(out).toContain('8 mm')
    expect(out).not.toContain('14 mm')       // B — the proposal is not prose
    const held = events(raw).filter((e) => e.applied === false)
    expect(held).toHaveLength(1)
    expect(held[0].kept).toBe('14 mm')        // …it is on the event
  })

  it('two lateralities in the nearest clause refuse', () => {
    const raw = 'Lésion rénale droite et kyste hépatique gauche. Je corrige, gauche.'
    const out = corrected(raw)
    expect(out).toContain('rénale droite')
    expect(out).toContain('hépatique gauche')
    expect(events(raw).some((e) => e.applied === false)).toBe(true)
  })

  it('a compound replacement is never reduced to a single-value swap', () => {
    // Two values in the replacement: which one supersedes the 8 mm is not
    // knowable. It must NOT become "Lésion de 9 mm" — the doctor is describing
    // two lesions. Superseding the whole clause is the pre-existing, correct
    // behaviour; silently keeping the old sentence and swapping one number is not.
    const raw = 'Lésion de 8 mm. Je corrige, 9 mm à droite et 12 mm à gauche.'
    const out = corrected(raw)
    expect(out).not.toBe('Lésion de 9 mm.')
    expect(out).not.toContain('Lésion de 9 mm')
    expect(out).toContain('12 mm') // neither value is invented or discarded
  })

  it('a compound replacement against a multi-finding clause refuses outright', () => {
    const raw = 'Foie normal, lésion de 8 mm. Je corrige, 9 mm à droite et 12 mm à gauche.'
    expect(events(raw).some((e) => e.applied === false)).toBe(true)
    expect(corrected(raw)).toBe('Foie normal, lésion de 8 mm.')
  })

  it('a replacement carrying clinical content is not reduced to a number swap', () => {
    // "nodule"/"spiculé" are outside the closed restatement vocabulary, so this
    // is a new statement rather than a restated value: the lesion description
    // is replaced wholesale, not silently trimmed down to "9 mm".
    const raw = 'Lésion de 8 mm. Je corrige, nodule spiculé de 9 mm.'
    expect(events(raw)[0].applied).toBe(true)
    expect(corrected(raw)).toBe('Nodule spiculé de 9 mm.')
  })
})

describe('C — clause splitting is decimal-safe', () => {
  it('a French decimal comma is not a clause boundary', () => {
    expect(splitClauses('Lésion de 3,5 cm').map((c) => c.text.trim()))
      .toEqual(['Lésion de 3,5 cm'])
  })

  it('an ordinary comma is', () => {
    expect(splitClauses('Foie normal, rate normale').map((c) => c.text.trim()))
      .toEqual(['Foie normal', 'rate normale'])
  })

  it('offsets point back into the source string', () => {
    const src = 'Foie normal, rate normale'
    for (const c of splitClauses(src)) {
      expect(src.slice(c.start, c.start + c.text.length)).toBe(c.text)
    }
  })

  it('a decimal measurement survives a correction unsplit', () => {
    expect(corrected('Kyste de 3,5 cm. Je corrige, 4,2 cm.')).toBe('Kyste de 4,2 cm.')
  })
})

describe('resolveCorrectionTarget contract', () => {
  it('refuses rather than guessing', () => {
    expect(resolveCorrectionTarget('Nodule de 12 mm et kyste de 8 mm', '14 mm'))
      .toEqual({ status: 'ambiguous', reason: 'multiple_measurements' })
    expect(resolveCorrectionTarget('Lésion droite et kyste gauche', 'gauche'))
      .toEqual({ status: 'ambiguous', reason: 'multiple_laterality' })
  })

  it('never invents a target that is not there', () => {
    expect(resolveCorrectionTarget('Foie homogène', '14 mm').status).toBe('clause')
    expect(resolveCorrectionTarget('Foie homogène', 'rate homogène').status).toBe('clause')
  })

  it('reattaches the continuation verbatim, separator included', () => {
    const out = resolveCorrectionTarget(
      'Lésion frontale droite mesurant 8 mm',
      '9 mm, aspect possiblement séculaire',
    )
    expect(out).toEqual({
      status: 'applied',
      text: 'Lésion frontale droite mesurant 9 mm, aspect possiblement séculaire',
      removed: '8 mm',
      inserted: '9 mm',
    })
  })
})
