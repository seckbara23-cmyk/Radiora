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
