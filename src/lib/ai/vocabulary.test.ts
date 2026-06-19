import { describe, it, expect } from 'vitest'
import {
  normalizeVocab,
  vocabularyConfidence,
  changesClinicalMeaning,
  learnCorrectionPairs,
  findVocabularyMatches,
} from './vocabulary'

describe('normalizeVocab', () => {
  it('lowercases, trims and collapses whitespace while keeping diacritics', () => {
    expect(normalizeVocab('  Hyper   Signal  ')).toBe('hyper signal')
    expect(normalizeVocab('Adénopathie')).toBe('adénopathie')
  })
})

describe('vocabularyConfidence', () => {
  it('grows with frequency and caps at 1', () => {
    expect(vocabularyConfidence(0)).toBe(0)
    expect(vocabularyConfidence(1)).toBe(0.2)
    expect(vocabularyConfidence(3)).toBe(0.6)
    expect(vocabularyConfidence(5)).toBe(1)
    expect(vocabularyConfidence(20)).toBe(1)
  })
})

describe('changesClinicalMeaning — protected wording', () => {
  it('is false for a pure spelling/wording fix', () => {
    expect(changesClinicalMeaning('hyper signal', 'hypersignal')).toBe(false)
    expect(changesClinicalMeaning('adéno pathie', 'adénopathie')).toBe(false)
  })

  it('is true when an uncertainty marker appears or disappears', () => {
    expect(changesClinicalMeaning('lésion', 'lésion probable')).toBe(true)
    expect(changesClinicalMeaning('nodule suspect', 'nodule')).toBe(true)
  })

  it('is true when a negation is added or removed', () => {
    expect(changesClinicalMeaning('présence de masse', 'pas de masse')).toBe(true)
    expect(changesClinicalMeaning('sans épanchement', 'épanchement')).toBe(true)
  })

  it('is true when a number changes', () => {
    expect(changesClinicalMeaning('mesure 12 mm', 'mesure 21 mm')).toBe(true)
    expect(changesClinicalMeaning('nodule', 'nodule de 8 mm')).toBe(true)
  })
})

describe('learnCorrectionPairs', () => {
  it('learns a single-word spelling fix as kind=word', () => {
    const pairs = learnCorrectionPairs(
      'on note une adénopathie médiastinale',
      'on note une adenopathie médiastinale',
    )
    // accent-insensitive token match means this single token differs only by accent
    expect(pairs).toHaveLength(1)
    expect(pairs[0].source).toBe('adénopathie')
    expect(pairs[0].kind).toBe('word')
  })

  it('learns a two-word → one-word join as kind=phrase', () => {
    const pairs = learnCorrectionPairs(
      'hyper signal en T2 FLAIR',
      'hypersignal en T2 FLAIR',
    )
    expect(pairs).toHaveLength(1)
    expect(pairs[0].source).toBe('hyper signal')
    expect(pairs[0].target).toBe('hypersignal')
    expect(pairs[0].kind).toBe('phrase')
  })

  it('refuses to learn a pair that changes clinical meaning', () => {
    const pairs = learnCorrectionPairs(
      'nodule du lobe supérieur',
      'nodule suspect du lobe supérieur',
    )
    expect(pairs).toEqual([])
  })

  it('refuses to learn a pair that changes a measurement', () => {
    const pairs = learnCorrectionPairs('masse de 12 mm', 'masse de 21 mm')
    expect(pairs).toEqual([])
  })

  it('ignores overly long replacement runs (not vocabulary)', () => {
    const pairs = learnCorrectionPairs(
      'foo',
      'one two three four five six seven',
    )
    expect(pairs).toEqual([])
  })

  it('returns nothing when texts are identical', () => {
    expect(learnCorrectionPairs('texte identique', 'texte identique')).toEqual([])
  })

  it('deduplicates repeated identical corrections', () => {
    const pairs = learnCorrectionPairs(
      'hyper signal puis hyper signal',
      'hypersignal puis hypersignal',
    )
    expect(pairs).toHaveLength(1)
  })
})

describe('findVocabularyMatches — suggestions only', () => {
  it('suggests the preferred term where the source appears', () => {
    const matches = findVocabularyMatches('on voit un hyper signal ici', [
      { id: 'e1', source: 'hyper signal', target: 'hypersignal', confidence: 0.8 },
    ])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      entryId: 'e1',
      term: 'hypersignal',
      original: 'hyper signal',
      replacement: 'hypersignal',
      confidence: 0.8,
    })
    expect('on voit un hyper signal ici'.slice(matches[0].startIndex, matches[0].endIndex)).toBe(
      'hyper signal',
    )
  })

  it('skips text that already uses the preferred form', () => {
    const matches = findVocabularyMatches('un hypersignal franc', [
      { source: 'hypersignal', target: 'hypersignal' },
    ])
    expect(matches).toEqual([])
  })

  it('defensively skips a stored entry that would change meaning', () => {
    const matches = findVocabularyMatches('lésion visible', [
      { source: 'lésion', target: 'lésion probable' },
    ])
    expect(matches).toEqual([])
  })

  it('returns non-overlapping matches sorted by position', () => {
    const matches = findVocabularyMatches('adéno pathie et hyper signal', [
      { source: 'hyper signal', target: 'hypersignal' },
      { source: 'adéno pathie', target: 'adénopathie' },
    ])
    expect(matches.map((x) => x.term)).toEqual(['adénopathie', 'hypersignal'])
  })
})
