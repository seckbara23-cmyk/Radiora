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
    expect(corrected).toContain('Vésicule lithiasique.')
    const suggestions = events.filter((e) => e.applied === false)
    expect(suggestions.length).toBe(1)
    expect(suggestions[0].removed).toContain('Foie normal')
  })

  it('an unlocalizable "ou plutôt" replacement preserves the text and emits a review suggestion', () => {
    const raw = 'Radiographie du genou droit, ou plutôt il faut revoir le protocole complet.'
    const { corrected, events } = detectSelfCorrections(raw)
    expect(corrected).toBe(raw) // verbatim — nothing deleted
    const suggestions = events.filter((e) => e.applied === false)
    expect(suggestions.length).toBe(1)
  })

  it('single-word laterality swap remains localized: droit → gauche', () => {
    const raw = 'Nodule du lobe droit, ou plutôt gauche.'
    const { corrected } = detectSelfCorrections(raw)
    expect(corrected).toBe('Nodule du lobe gauche.')
  })
})
