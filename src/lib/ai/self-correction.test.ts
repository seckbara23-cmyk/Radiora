import { describe, it, expect } from 'vitest'
import { detectSelfCorrections } from '@/lib/ai/self-correction'
import { preservesUncertainty } from '@/lib/ai/uncertainty'

// F10 #9 — self-correction behaviour: only DROP what the doctor retracted,
// never invent, and never silently weaken a hedge.

describe('detectSelfCorrections', () => {
  it('drops a clause retracted by a standalone "Non."', () => {
    const raw = "Pas d'épanchement pleural. Non. Fine lame pleurale gauche."
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toContain('Fine lame pleurale gauche')
    expect(corrected).not.toContain("Pas d'épanchement pleural")
    expect(events.length).toBe(1)
    expect(events[0].removed).toContain("Pas d'épanchement")
  })

  it('applies an inline "ou plutôt" replacement', () => {
    const raw = 'Lésion hyperéchogène ou plutôt hypoéchogène du foie.'
    const { corrected } = detectSelfCorrections(raw)
    expect(corrected.toLowerCase()).toContain('hypoéchogène')
    expect(corrected.toLowerCase()).not.toContain('hyperéchogène')
  })

  it('does NOT treat bare "plutôt" as a corrector (it is a qualifier)', () => {
    const raw = 'Plage plutôt hypoéchogène du segment VII.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(events.length).toBe(0)
    expect(corrected.toLowerCase()).toContain('plutôt hypoéchogène')
  })

  it('preserves a negation that is not retracted', () => {
    const raw = "Absence d'adénopathie médiastinale."
    const { corrected } = detectSelfCorrections(raw)
    expect(corrected).toContain("Absence d'adénopathie")
  })

  it('does not weaken uncertainty when correcting', () => {
    const raw = 'Image douteuse. Non. Nodule probable du lobe supérieur.'
    const { corrected } = detectSelfCorrections(raw)
    // the surviving clause keeps its hedge
    expect(preservesUncertainty('Nodule probable', corrected)).toBe(true)
  })
})

// R0.3 — preservation-first regressions. The audit executed the previous
// pipeline and proved it corrupted measurements, deleted surgical history and
// erased dictated negative findings. Each case below is an exact audit input.

const destructive = (events: { applied?: boolean }[]) =>
  events.filter((e) => e.applied !== false)

describe('detectSelfCorrections — R0.3 preservation-first', () => {
  it('leaves legitimate medical use of "correction" untouched (surgical history)', () => {
    const raw = 'Patient opéré pour correction de scoliose.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toBe('Patient opéré pour correction de scoliose.')
    expect(destructive(events).length).toBe(0)
  })

  it('never splits a decimal measurement: retraction keeps "4.5 cm" intact', () => {
    const raw = 'Kyste de 3.5 cm. Non. Kyste de 4.5 cm.'
    const { corrected } = detectSelfCorrections(raw)
    expect(corrected).toBe('Kyste de 4.5 cm.')
    expect(corrected).not.toContain('Kyste de 3. Kyste de 4. 5 cm.')
  })

  it('preserves "12.5 mm" verbatim when there is no correction at all', () => {
    const raw = 'Le nodule mesure 12.5 mm.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toBe('Le nodule mesure 12.5 mm.')
    expect(events.length).toBe(0)
  })

  it('"Question ? Non." is an answer, not a retraction — the negative finding survives', () => {
    const raw = 'Anomalie de perfusion ? Non. Parenchyme homogène.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toContain('Anomalie de perfusion ?')
    expect(corrected).toContain('Non.')
    expect(corrected).toContain('Parenchyme homogène.')
    expect(destructive(events).length).toBe(0)
  })

  it('"ou plutôt" swaps only the measurement — lesion identity, location and laterality survive', () => {
    const raw = 'Nodule du lobe supérieur droit mesurant 12 mm, ou plutôt 14 mm.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toContain('Nodule du lobe supérieur droit')
    expect(corrected).toContain('14 mm')
    expect(corrected).not.toContain('12 mm')
    expect(events.length).toBe(1)
    expect(events[0].applied).toBe(true)
    expect(events[0].removed).toBe('12 mm')
  })

  it('a multi-finding sentence is never deleted by a standalone "Non." — preserved + flagged', () => {
    const raw = 'Foie normal, pas de lésion focale, vésicule alithiasique. Non. Vésicule lithiasique.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toContain('Foie normal')
    expect(corrected).toContain('pas de lésion focale')
    expect(corrected).toContain('vésicule alithiasique')

    // R2.7C(B) — CHANGED, deliberately. R0.3 asserted the replacement stayed in
    // the text beside the finding it was meant to replace. That leaves the
    // report asserting a gallbladder that is both alithiasique AND lithiasique,
    // with nothing but a flag to say which the doctor meant. The finding now
    // stands alone and the replacement travels as a proposal on the event —
    // still visible to the radiologist, no longer clinical prose.
    expect(corrected).not.toContain('Vésicule lithiasique.')
    const suggestions = events.filter((e) => e.applied === false)
    expect(suggestions.length).toBe(1)
    expect(suggestions[0].removed).toContain('Foie normal')
    expect(suggestions[0].kept).toBe('Vésicule lithiasique')
  })

  it('an unlocalizable "ou plutôt" replacement keeps the finding and proposes the rest', () => {
    const raw = 'Radiographie du genou droit, ou plutôt il faut revoir le protocole complet.'
    const { corrected, events } = detectSelfCorrections(raw)

    // R2.7C(B) — CHANGED, deliberately. R0.3 kept the sentence verbatim, which
    // meant "ou plutôt" was printed into a clinical section. Nothing is deleted:
    // the finding stays, the retraction becomes a reviewable proposal, and the
    // doctor's literal words remain in the immutable raw transcript.
    expect(corrected).toBe('Radiographie du genou droit.')
    expect(corrected).not.toContain('ou plutôt')

    const suggestions = events.filter((e) => e.applied === false)
    expect(suggestions.length).toBe(1)
    expect(suggestions[0].removed).toBe('Radiographie du genou droit')
    expect(suggestions[0].kept).toBe('il faut revoir le protocole complet')
  })

  it('no correction marker ever survives into the corrected text', () => {
    // The R2.7C(B) invariant, checked across every refusal path at once.
    // "Non" is exempt: after a question it is a dictated negative finding.
    const MARKERS = /\b(?:je\s+(?:me\s+)?corrige|ou\s+plut[oô]t|non\s+plut[oô]t|remplacez?\s+par|je\s+reprends|c'est\s+faux)\b/i
    const corpus = [
      'Nodule de 12 mm et kyste de 8 mm. Je corrige, 14 mm.',
      'Lésion rénale droite et kyste hépatique gauche. Je corrige, gauche.',
      'Foie normal, pas de lésion focale, vésicule alithiasique. Je corrige, vésicule lithiasique.',
      'Radiographie du genou droit, ou plutôt il faut revoir le protocole complet.',
      'Épanchement pleural ? Je corrige, fine lame gauche.',
      "Présence d'une lésion mesurant 8 mm, je corrige 9 mm, à corréler au contexte.",
    ]
    for (const raw of corpus) {
      expect(detectSelfCorrections(raw).corrected, raw).not.toMatch(MARKERS)
    }
  })

  it('single-word laterality swap remains localized: droit → gauche', () => {
    const raw = 'Nodule du lobe droit, ou plutôt gauche.'
    const { corrected } = detectSelfCorrections(raw)
    expect(corrected).toBe('Nodule du lobe gauche.')
  })
})
