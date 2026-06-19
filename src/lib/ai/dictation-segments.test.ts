import { describe, it, expect } from 'vitest'
import {
  splitDictationSegments,
  hasMultiplePatients,
} from './dictation-segments'

describe('splitDictationSegments', () => {
  it('returns [] for empty / whitespace input', () => {
    expect(splitDictationSegments('')).toEqual([])
    expect(splitDictationSegments('   \n  ')).toEqual([])
  })

  it('returns a single segment when there is no separator', () => {
    const out = splitDictationSegments('Scanner cérébral sans particularité. Conclusion : normal.')
    expect(out).toHaveLength(1)
    expect(out[0].separator).toBeNull()
    expect(out[0].text).toContain('Scanner cérébral')
  })

  it('splits on "patient suivant" and drops the cue from the text', () => {
    const out = splitDictationSegments(
      'Echographie abdominale normale. Patient suivant. Radiographie thoracique sans anomalie.',
    )
    expect(out).toHaveLength(2)
    expect(out[0].text).toContain('Echographie abdominale normale')
    expect(out[1].separator).toBe('patient suivant')
    expect(out[1].text).toContain('Radiographie thoracique')
    expect(out[1].text.toLowerCase()).not.toContain('patient suivant')
  })

  it('handles "nouveau patient" and "nouvelle patiente" variants', () => {
    const out = splitDictationSegments(
      'Premier examen normal. Nouveau patient. Deuxième examen. Nouvelle patiente. Troisième examen.',
    )
    expect(out).toHaveLength(3)
    expect(out[1].separator).toBe('nouveau patient')
    expect(out[2].separator).toBe('nouveau patient') // both variants share the label
  })

  it('keeps the cue for "nom du patient" and extracts a name hint', () => {
    const out = splitDictationSegments(
      'Nom du patient Awa Diop. Echographie pelvienne normale.',
    )
    expect(out).toHaveLength(1)
    expect(out[0].separator).toBe('nom du patient')
    expect(out[0].text.toLowerCase()).toContain('nom du patient')
    expect(out[0].hint).toBe('Awa Diop')
  })

  it("extracts the exam number hint for \"numéro d'examen\"", () => {
    const out = splitDictationSegments(
      "Scanner normal. Numéro d'examen 4521. Echographie suivante normale.",
    )
    expect(out).toHaveLength(2)
    expect(out[1].separator).toBe("numéro d'examen")
    expect(out[1].hint).toBe('4521')
  })

  it('tolerates missing accents from ASR output', () => {
    const out = splitDictationSegments(
      "Premier compte rendu. Numero d examen 12. Second compte rendu.",
    )
    expect(out).toHaveLength(2)
    expect(out[1].separator).toBe("numéro d'examen")
  })

  it('splits on "examen suivant" / "prochain examen"', () => {
    const out = splitDictationSegments(
      'IRM cérébrale normale. Examen suivant. Scanner thoracique normal. Prochain examen. Echo normale.',
    )
    expect(out).toHaveLength(3)
    expect(out.map((s) => s.index)).toEqual([1, 2, 3])
  })

  it('numbers segments sequentially from 1', () => {
    const out = splitDictationSegments('A. Patient suivant. B. Patient suivant. C.')
    expect(out.map((s) => s.index)).toEqual([1, 2, 3])
    expect(out.map((s) => s.text)).toEqual(['A.', 'B.', 'C.'])
  })

  it('skips empty chunks between back-to-back cues', () => {
    const out = splitDictationSegments('Patient suivant. Patient suivant. Examen unique normal.')
    expect(out).toHaveLength(1)
    expect(out[0].text).toContain('Examen unique normal')
  })
})

describe('hasMultiplePatients', () => {
  it('is false for a single-patient dictation', () => {
    expect(hasMultiplePatients('Scanner normal sans particularité.')).toBe(false)
  })
  it('is true when a separator splits two patients', () => {
    expect(hasMultiplePatients('Examen 1. Patient suivant. Examen 2.')).toBe(true)
  })
})
