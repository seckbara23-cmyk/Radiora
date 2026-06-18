import { describe, it, expect } from 'vitest'
import {
  findUncertaintyTerms,
  lostUncertaintyTerms,
  preservesUncertainty,
} from '@/lib/ai/uncertainty'
import { cleanupFrench } from '@/lib/ai/french-cleanup'

// F10 #2 — AI cleanup and structuring must NEVER convert uncertainty into
// certainty. Every protected hedge present before a pass must survive it.

const PROTECTED = [
  'Nodule probable du lobe supérieur droit.',
  'Lésion possible de la rate.',
  'Image compatible avec un kyste biliaire.',
  'Aspect en faveur d\'une pneumopathie.',
  'Suspicion de fracture du scaphoïde.',
  'Épaississement à confirmer par IRM.',
  'Anomalie à discuter en RCP.',
  'Un processus tumoral ne peut être exclu.',
  'Aspect évocateur de sarcoïdose.',
]

describe('uncertainty detection', () => {
  it('detects each protected term', () => {
    for (const phrase of PROTECTED) {
      expect(findUncertaintyTerms(phrase).length).toBeGreaterThan(0)
    }
  })

  it('matches despite missing accents (dictation accent loss)', () => {
    expect(findUncertaintyTerms('ne peut etre exclu')).toContain('ne_peut_etre_exclu')
    expect(findUncertaintyTerms('aspect evocateur de')).toContain('evocateur_de')
  })

  it('reports a lost term when certainty replaces a hedge', () => {
    const before = 'Nodule probable du lobe supérieur.'
    const after = 'Nodule du lobe supérieur.' // hedge dropped
    expect(lostUncertaintyTerms(before, after)).toContain('probable')
    expect(preservesUncertainty(before, after)).toBe(false)
  })

  it('treats collapsing a stutter as no loss (presence-based)', () => {
    expect(preservesUncertainty('probable probable nodule', 'probable nodule')).toBe(true)
  })
})

describe('cleanupFrench preserves uncertainty', () => {
  it('keeps every protected hedge through the cleanup pass', () => {
    for (const phrase of PROTECTED) {
      const { cleaned } = cleanupFrench(phrase)
      expect(preservesUncertainty(phrase, cleaned)).toBe(true)
    }
  })

  it('still cleans fillers while keeping the hedge', () => {
    const input = 'euh, euh, nodule probable du lobe supérieur droit'
    const { cleaned } = cleanupFrench(input)
    expect(preservesUncertainty(input, cleaned)).toBe(true)
    expect(findUncertaintyTerms(cleaned)).toContain('probable')
  })
})
