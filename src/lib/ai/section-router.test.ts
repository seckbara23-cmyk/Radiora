import { describe, it, expect } from 'vitest'
import { routeTranscript, matchHeader } from '@/lib/ai/section-router'
import { parseStructuredText, parseStructuredTextWithProvenance, type HpdContext } from '@/lib/ai/hpd-engine'

// R2.6 — section routing. The governing rule:
//
//     Empty section > incorrect duplicated clinical content.
//
// Every sentence goes to at most ONE section. There is no pass that copies text
// into a section to keep it non-empty.

const ctx: HpdContext = {
  modality: 'CT', bodyPart: 'cerveau',
  patientName: 'Test', patientAge: '50 ans', patientSex: 'M', locale: 'fr',
}

/** Every section the given text appears in. */
const sectionsContaining = (sd: ReturnType<typeof parseStructuredText>, needle: string) =>
  (['indication', 'technique', 'results', 'conclusion', 'recommendations'] as const)
    .filter((k) => (sd[k] ?? '').toLowerCase().includes(needle.toLowerCase()))

describe('the reported bug', () => {
  it('1. an indication-only transcript does NOT populate findings', () => {
    const sd = parseStructuredText('Indication traumatisme crânien.', ctx)

    expect(sd.indication).toBe('traumatisme crânien.')
    expect(sd.results).toBe('')
    expect(sd.conclusion).toBe('')
    expect(sectionsContaining(sd, 'traumatisme')).toEqual(['indication'])
  })

  it('the colon form behaves identically', () => {
    const sd = parseStructuredText('Indication : traumatisme crânien.', ctx)
    expect(sd.indication).toBe('traumatisme crânien.')
    expect(sd.results).toBe('')
  })

  it('the header itself never leaks into a clinical section', () => {
    const sd = parseStructuredText('Indication : douleur abdominale droite.', ctx)
    for (const k of ['indication', 'results', 'conclusion'] as const) {
      expect(sd[k].toLowerCase()).not.toContain('indication :')
    }
  })

  it('2. a technique-only transcript does NOT populate findings', () => {
    const sd = parseStructuredText('Technique : scanner cérébral sans injection.', ctx)
    expect(sd.technique).toBe('scanner cérébral sans injection.')
    expect(sd.results).toBe('')
    expect(sectionsContaining(sd, 'sans injection')).toEqual(['technique'])
  })

  it('indication + technique only still leaves findings empty', () => {
    const sd = parseStructuredText(
      'Indication : céphalées.\nTechnique : scanner cérébral sans injection.',
      ctx,
    )
    expect(sd.indication).toBe('céphalées.')
    expect(sd.results).toBe('')
    expect(sd.conclusion).toBe('')
  })
})

describe('explicit headers', () => {
  it('3. explicit findings populate findings', () => {
    const sd = parseStructuredText('Résultats : petite hyperdensité frontale droite.', ctx)
    expect(sd.results).toBe('petite hyperdensité frontale droite.')
    expect(sd.indication).toBe('')
  })

  it('4. an explicit conclusion populates conclusion', () => {
    const sd = parseStructuredText('Conclusion : contusion frontale droite.', ctx)
    expect(sd.conclusion).toBe('contusion frontale droite.')
    expect(sd.results).toBe('')
  })

  it('5. repeated headers append rather than replace', () => {
    const sd = parseStructuredText(
      'Résultats : foie homogène.\nRésultats : rate normale.',
      ctx,
    )
    expect(sd.results).toContain('foie homogène')
    expect(sd.results).toContain('rate normale')
  })

  it('6. an explicit destination wins over topical vocabulary', () => {
    // "suspicion de" is indication vocabulary, but the doctor said Résultats.
    const sd = parseStructuredText(
      'Résultats : masse pulmonaire du lobe supérieur droit. Suspicion de malignité.',
      ctx,
    )
    expect(sd.results).toContain('Suspicion de malignité')
    expect(sd.indication).toBe('')
  })

  it('a bare header with no content routes nothing', () => {
    expect(matchHeader('Résultats :')).toBeNull()
    expect(matchHeader('Conclusion')).toBeNull()
  })

  it('a plural is not the header', () => {
    // "Indications" opens a clinical sentence, not an INDICATION section.
    expect(matchHeader('Indications opératoires discutées.')).toBeNull()
  })

  it('longest alias wins', () => {
    expect(matchHeader('Indication clinique : céphalées.')).toEqual({
      section: 'indication', body: 'céphalées.',
    })
  })
})

describe('the report flows forward', () => {
  it('findings dictated after an indication header become findings', () => {
    const sd = parseStructuredText(
      'Indication : céphalées. Petite hyperdensité frontale droite.',
      ctx,
    )
    expect(sd.indication).toBe('céphalées.')
    expect(sd.results).toContain('hyperdensité frontale droite')
    expect(sectionsContaining(sd, 'hyperdensité')).toEqual(['results'])
  })

  it('a strong marker moves to conclusion', () => {
    const sd = parseStructuredText(
      'Le foie est de taille normale. Au total, examen sans anomalie significative.',
      ctx,
    )
    expect(sd.results).toContain('foie')
    // "Au total," is the section label; the clinical text is what follows it.
    expect(sd.conclusion).toBe('examen sans anomalie significative.')
    expect(sd.conclusion).not.toContain('foie')
  })

  it('"au total" mid-sentence is ordinary French, not a conclusion marker', () => {
    const sd = parseStructuredText(
      'Résultats : il existe au total deux lésions hépatiques.',
      ctx,
    )
    expect(sd.results).toContain('au total deux lésions')
    expect(sd.conclusion).toBe('')
  })

  it('a recommendation marker moves on again', () => {
    const sd = parseStructuredText(
      'Au total, nodule hépatique. Conduite à tenir : contrôle scanographique à 6 mois.',
      ctx,
    )
    expect(sd.conclusion).toContain('nodule hépatique')
    expect(sd.recommendations).toContain('6 mois')
    expect(sd.conclusion).not.toContain('6 mois')
  })

  it('weak evidence never rewinds the report', () => {
    const sd = parseStructuredText(
      'Résultats : masse pulmonaire. Bilan de suspicion de malignité.',
      ctx,
    )
    expect(sd.indication).toBe('')
    expect(sd.results).toContain('Bilan')
  })
})

describe('conclusion is never guessed', () => {
  it('12. plain findings dictation leaves conclusion empty', () => {
    const sd = parseStructuredText(
      'Le foie est de taille normale et de contours réguliers. Pas de lésion focale décelable. La rate est normale.',
      ctx,
    )
    expect(sd.results).toContain('foie')
    expect(sd.results).toContain('rate')
    // The old parser assigned the last ~30% of sentences to CONCLUSION.
    expect(sd.conclusion).toBe('')
  })

  it('no sentence is ever split across results and conclusion', () => {
    const sd = parseStructuredText(
      'Nodule hépatique de 12 mm. Pas de lésion splénique. Au total, nodule à contrôler.',
      ctx,
    )
    expect(sd.results).not.toContain('Au total')
    expect(sd.conclusion).not.toContain('splénique')
  })
})

describe('technique auto-fill', () => {
  it('13. the template is used only when nothing was dictated, and is marked', () => {
    const parsed = parseStructuredTextWithProvenance('Indication : céphalées.', ctx)
    expect(parsed.data.technique).toContain('Scanner réalisé')
    expect(parsed.provenance.technique).toBe('auto_filled')
  })

  it('a dictated technique is never replaced by the template', () => {
    const parsed = parseStructuredTextWithProvenance(
      'Technique : acquisition hélicoïdale après injection.',
      ctx,
    )
    expect(parsed.data.technique).toBe('acquisition hélicoïdale après injection.')
    expect(parsed.provenance.technique).toBe('explicit_header')
  })

  it('no modality means no template — nothing is invented', () => {
    const parsed = parseStructuredTextWithProvenance('Indication : céphalées.', {
      ...ctx, modality: null,
    })
    expect(parsed.data.technique).toBe('')
  })
})

describe('provenance', () => {
  it('distinguishes dictated, classified, continued and generated content', () => {
    const parsed = parseStructuredTextWithProvenance(
      'Indication : céphalées. Petite hyperdensité frontale droite. Au total, contusion.',
      ctx,
    )
    expect(parsed.provenance.indication).toBe('explicit_header')
    expect(parsed.provenance.results).toBe('semantic')
    // "Au total," is a marker the doctor dictated, so it counts as explicit.
    expect(parsed.provenance.conclusion).toBe('explicit_header')
    expect(parsed.provenance.technique).toBe('auto_filled')
  })

  it('carries source ranges back to the transcript', () => {
    const text = 'Indication : céphalées. Petite hyperdensité frontale droite.'
    const parsed = parseStructuredTextWithProvenance(text, ctx)
    const range = parsed.ranges.results![0]
    expect(text.slice(range.start, range.end)).toContain('hyperdensité')
  })

  it('a section takes the strongest provenance of its sentences', () => {
    const parsed = parseStructuredTextWithProvenance(
      'Résultats : foie homogène. La rate est sans particularité.',
      ctx,
    )
    expect(parsed.provenance.results).toBe('explicit_header')
  })
})

describe('no duplication, ever', () => {
  it('7. the same clause never lands in two sections', () => {
    const transcripts = [
      'Indication traumatisme crânien.',
      'Indication : céphalées. Technique : scanner sans injection. Résultats : pas d’anomalie. Conclusion : examen normal.',
      'Le foie est de taille normale. Au total, examen normal.',
      'Nodule hépatique de 12 mm dans le segment VII.',
      'Technique : coupes axiales fines.',
    ]
    for (const t of transcripts) {
      const routed = routeTranscript(t)
      const seen = new Map<string, string>()
      for (const s of routed.sentences) {
        const prior = seen.get(s.body)
        expect(prior, `"${s.body}" routed to both ${prior} and ${s.section}`).toBeUndefined()
        seen.set(s.body, s.section)
      }
    }
  })

  it('every sentence of the transcript is accounted for exactly once', () => {
    const text = 'Indication : céphalées. Petite hyperdensité frontale droite. Au total, contusion.'
    const routed = routeTranscript(text)
    expect(routed.sentences).toHaveLength(3)
    expect(new Set(routed.sentences.map((s) => s.start)).size).toBe(3)
  })
})

describe('content is preserved verbatim', () => {
  it('decimals and accents survive routing', () => {
    const sd = parseStructuredText(
      'Résultats : masse hétérogène de 3,2 cm. Lésion de 3.5 cm du segment VII. Nodule de 12 × 8 mm.',
      ctx,
    )
    expect(sd.results).toContain('3,2 cm')
    expect(sd.results).toContain('3.5 cm')
    expect(sd.results).toContain('12 × 8 mm')
    expect(sd.results).toContain('hétérogène')
  })

  it('negation and laterality survive routing', () => {
    const sd = parseStructuredText(
      'Résultats : pas d’hémorragie intracrânienne. Lésion rénale droite.',
      ctx,
    )
    expect(sd.results).toContain('pas d’hémorragie')
    expect(sd.results).toContain('rénale droite')
  })
})
