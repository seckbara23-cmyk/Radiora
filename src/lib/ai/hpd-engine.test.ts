import { describe, it, expect } from 'vitest'
import { parseStructuredText, type HpdContext } from '@/lib/ai/hpd-engine'

// Regression tests for the section-header parser. The splitter is built from
// accent-folded keywords but matched against the original (accented) text; it
// must recognise accented AND unaccented French headers identically, without
// altering the clinical content between headers.

const ctx: HpdContext = {
  modality: 'CT',
  bodyPart: 'cerveau',
  patientName: 'Test Patient',
  patientAge: '50 ans',
  patientSex: 'Masculin',
  locale: 'fr',
}

describe('parseStructuredText — accented/unaccented section headers', () => {
  it('1. parses an uppercase accented "RÉSULTATS :" header', () => {
    const sd = parseStructuredText(
      [
        'INDICATION : céphalées.',
        'TECHNIQUE : scanner cérébral sans injection.',
        'RÉSULTATS : pas d’anomalie décelable.',
        'CONCLUSION : examen normal.',
      ].join('\n'),
      ctx,
    )
    expect(sd.results).toBe('pas d’anomalie décelable.')
    expect(sd.conclusion).toBe('examen normal.')
  })

  it('2. parses a capitalised accented "Résultats :" header', () => {
    const sd = parseStructuredText(
      [
        'Indication : céphalées.',
        'Technique : scanner cérébral sans injection.',
        'Résultats : petite hyperdensité frontale droite.',
        'Conclusion : contusion frontale droite.',
      ].join('\n'),
      ctx,
    )
    expect(sd.results).toBe('petite hyperdensité frontale droite.')
    expect(sd.conclusion).toBe('contusion frontale droite.')
  })

  it('3. still parses the unaccented "RESULTATS :" header', () => {
    const sd = parseStructuredText(
      [
        'INDICATION : cephalees.',
        'TECHNIQUE : scanner cerebral sans injection.',
        'RESULTATS : pas d’anomalie.',
        'CONCLUSION : examen normal.',
      ].join('\n'),
      ctx,
    )
    expect(sd.results).toBe('pas d’anomalie.')
    expect(sd.conclusion).toBe('examen normal.')
  })

  it('4. still parses the "EN CONCLUSION :" header variant', () => {
    const sd = parseStructuredText(
      [
        'Indication : douleur thoracique.',
        'Résultats : opacité du lobe supérieur droit.',
        'En conclusion : aspect évocateur d’une pneumopathie.',
      ].join('\n'),
      ctx,
    )
    expect(sd.results).toBe('opacité du lobe supérieur droit.')
    expect(sd.conclusion).toBe('aspect évocateur d’une pneumopathie.')
  })

  it('5. accent handling does not change the clinical content between headers', () => {
    // The exact same report, dictated with vs without accents on the HEADERS
    // only, must yield identical section bodies (content is preserved verbatim).
    const body = {
      indication: 'suspicion de récidive tumorale.',
      results: 'masse hétérogène de 3,2 cm avec rehaussement périphérique.',
      conclusion: 'lésion suspecte à corréler à l’IRM.',
    }
    const accented = parseStructuredText(
      [
        `Indication : ${body.indication}`,
        `Résultats : ${body.results}`,
        `Conclusion : ${body.conclusion}`,
      ].join('\n'),
      ctx,
    )
    const folded = parseStructuredText(
      [
        `Indication : ${body.indication}`,
        `Resultats : ${body.results}`,
        `Conclusion : ${body.conclusion}`,
      ].join('\n'),
      ctx,
    )
    expect(accented.indication).toBe(body.indication)
    expect(accented.results).toBe(body.results)
    expect(accented.conclusion).toBe(body.conclusion)
    // Identical bodies regardless of header accentuation.
    expect(folded.indication).toBe(accented.indication)
    expect(folded.results).toBe(accented.results)
    expect(folded.conclusion).toBe(accented.conclusion)
  })
})
