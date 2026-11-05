import { describe, it, expect } from 'vitest'
import {
  applyTranscriptPass,
  appendTranscriptPass,
  nextSourceTranscript,
} from '@/lib/dictation/transcription-state'

// R2.7C-MULTIPASS-FIX-01 — a second dictation pass must not undo an edit.
//
// Found at the 2026-11-05 checkpoint: `transcribeReportAudio` wrote the raw
// canonical append into BOTH `transcriptions.raw_text` and
// `transcriptions.corrected_text`. Phone (`uploadFromMobile`) and import
// (`importReportAudio`) attach every new recording to the ONE report-owned
// transcript row, so a doctor who dictated, corrected the transcript box, then
// dictated again had the correction silently replaced by the provider's
// original words. `raw_text` was right all along; only the working copy was
// wrong. These tests pin the rule that fixes it, on the real production sample.

const PASS_1 =
  "Scanner cérébral, pas d'hémorragie intracrânienne, présence d'une petite lésion " +
  'hypodense frontale droite mesurant 8 mm, je corrige 9 mm.'
// The doctor tidied the box: marker gone, value corrected.
const EDIT_1 =
  "Scanner cérébral, pas d'hémorragie intracrânienne, présence d'une petite lésion " +
  'hypodense frontale droite mesurant 9 mm.'
const PASS_2 = "Pas d'effet de masse. Conclusion, absence d'anomalie intracrânienne aiguë."
const PASS_3 = 'Petite lésion frontale droite probablement séquellaire.'

const EMPTY = { raw: '', corrected: '' }

describe('first pass', () => {
  it('initialises both columns to the provider text, verbatim', () => {
    expect(applyTranscriptPass(EMPTY, PASS_1)).toEqual({ raw: PASS_1, corrected: PASS_1 })
  })

  it('a row opened by an upload (both columns empty) behaves the same', () => {
    // importReportAudio / uploadFromMobile insert the row with no text at all;
    // the columns are NOT NULL DEFAULT '' (migration 018).
    const first = applyTranscriptPass({ raw: '', corrected: '' }, PASS_1)
    expect(first.raw).toBe(PASS_1)
    expect(first.corrected).toBe(PASS_1)
  })
})

describe('second pass with no edit in between', () => {
  it('appends to both columns identically — the pre-fix behaviour, kept', () => {
    const after1 = applyTranscriptPass(EMPTY, PASS_1)
    const after2 = applyTranscriptPass(after1, PASS_2)
    expect(after2.raw).toBe(`${PASS_1}\n\n${PASS_2}`)
    expect(after2.corrected).toBe(after2.raw)
  })
})

describe('second pass after a clinician edit', () => {
  const stored = { raw: PASS_1, corrected: EDIT_1 }
  const after2 = applyTranscriptPass(stored, PASS_2)

  it('keeps the edit and appends the pass to it', () => {
    expect(after2.corrected).toBe(`${EDIT_1}\n\n${PASS_2}`)
    expect(after2.corrected).toContain('9 mm')
    expect(after2.corrected).not.toContain('8 mm')
    expect(after2.corrected).not.toContain('je corrige')
  })

  it('raw_text stays canonical: the marker is still there and the edit never enters it', () => {
    expect(after2.raw).toBe(`${PASS_1}\n\n${PASS_2}`)
    expect(after2.raw).toContain('8 mm, je corrige 9 mm')
    expect(after2.raw).not.toBe(after2.corrected)
  })

  it('the defect shape can no longer be produced', () => {
    // The old write was `corrected_text: canonical` — i.e. this value.
    const oldCanonical = appendTranscriptPass(stored.raw, PASS_2)
    expect(after2.corrected).not.toBe(oldCanonical)
  })

  it('the save rule still protects the source afterwards', () => {
    // When the workspace later saves the working copy, raw_text must not be
    // rewritten by it: the working copy no longer EXTENDS the source.
    expect(nextSourceTranscript(after2.raw, after2.corrected)).toBe(after2.raw)
  })
})

describe('ordering', () => {
  it('three passes stay in dictation order in both columns', () => {
    let s = applyTranscriptPass(EMPTY, PASS_1)
    s = applyTranscriptPass({ raw: s.raw, corrected: EDIT_1 }, PASS_2)
    s = applyTranscriptPass(s, PASS_3)

    expect(s.raw).toBe(`${PASS_1}\n\n${PASS_2}\n\n${PASS_3}`)
    expect(s.corrected).toBe(`${EDIT_1}\n\n${PASS_2}\n\n${PASS_3}`)
    for (const col of [s.raw, s.corrected]) {
      expect(col.indexOf(PASS_2)).toBeLessThan(col.indexOf(PASS_3))
    }
  })
})

describe('passes that carry nothing', () => {
  const stored = { raw: PASS_1, corrected: EDIT_1 }

  it('an empty pass changes neither column', () => {
    expect(applyTranscriptPass(stored, '')).toEqual(stored)
  })

  it('a whitespace pass changes neither column', () => {
    expect(applyTranscriptPass(stored, '  \n ')).toEqual(stored)
  })

  it('a re-delivered identical pass is not appended twice', () => {
    const once  = applyTranscriptPass(stored, PASS_2)
    const twice = applyTranscriptPass(once, PASS_2)
    expect(twice).toEqual(once)
  })
})

describe('cleared working copy', () => {
  it('falls back to the source, the same rule structuring reads by', () => {
    // saveReportTranscript writes corrected_text = '' when the box is cleared
    // while nextSourceTranscript keeps raw_text. structureReportTranscript
    // reads `corrected_text || raw_text`, so the next pass must build on raw.
    const after = applyTranscriptPass({ raw: PASS_1, corrected: '' }, PASS_2)
    expect(after.raw).toBe(`${PASS_1}\n\n${PASS_2}`)
    expect(after.corrected).toBe(after.raw)
  })

  it('a whitespace-only working copy counts as cleared', () => {
    const after = applyTranscriptPass({ raw: PASS_1, corrected: '   ' }, PASS_2)
    expect(after.corrected).toBe(`${PASS_1}\n\n${PASS_2}`)
  })
})

describe('mixed sources', () => {
  it('a workstation transcript saved first survives a phone pass', () => {
    // Web Speech text is saved through saveReportTranscript (raw = corrected),
    // then edited, then the doctor finishes on the phone.
    const typed  = 'Indication : céphalées.'
    const edited = 'Indication : céphalées persistantes.'
    const after  = applyTranscriptPass({ raw: typed, corrected: edited }, PASS_1)
    expect(after.raw).toBe(`${typed}\n\n${PASS_1}`)
    expect(after.corrected).toBe(`${edited}\n\n${PASS_1}`)
  })
})
