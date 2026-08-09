import { describe, it, expect } from 'vitest'
import { cleanupFrench } from '@/lib/ai/french-cleanup'

// R2.0 — regression coverage for the cleanup pass.
//
// R0.3 guaranteed that a decimal measurement is never split at the point, and
// enforced it in detectSelfCorrections. cleanupFrench was never checked, and
// its tidy() "one space after punctuation" rule rewrote "3.5 cm" as "3. 5 cm" —
// silently changing a clinical value on every surface that runs the canonical
// pipeline. These pin the invariant where the defect was.

describe('cleanupFrench — decimal measurements', () => {
  it('never splits a decimal point', () => {
    expect(cleanupFrench('Kyste de 3.5 cm du rein droit.').cleaned).toContain('3.5 cm')
  })

  it('never splits a French decimal comma', () => {
    expect(cleanupFrench('Masse de 3,2 cm au lobe droit.').cleaned).toContain('3,2 cm')
  })

  it('preserves several decimals in one sentence', () => {
    const { cleaned } = cleanupFrench('Nodules de 12.5 mm et 4,8 mm.')
    expect(cleaned).toContain('12.5 mm')
    expect(cleaned).toContain('4,8 mm')
  })

  it('still spaces genuine sentence punctuation', () => {
    const { cleaned } = cleanupFrench('Foie homogène.Rate normale.')
    expect(cleaned).toContain('Foie homogène. Rate normale.')
  })

  it('still spaces a list comma', () => {
    expect(cleanupFrench('Foie,rate,pancréas sans anomalie.').cleaned)
      .toContain('Foie, rate, pancréas')
  })

  it('leaves an ordinary abbreviation alone', () => {
    // Not digit-flanked → normal punctuation handling applies.
    expect(cleanupFrench('Dr.Diop a relu.').cleaned).toContain('Dr. Diop')
  })
})
