import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nextSourceTranscript, appendTranscriptPass } from '@/lib/dictation/transcription-state'
import { detectSelfCorrections } from '@/lib/ai/self-correction'
import { runStructuring } from '@/lib/ai/structuring-engine'

// R2.7C closure gate — the ORIGINAL dictation is evidence, not a draft.
//
// The audit found that `saveReportTranscript` wrote the workspace's EDITABLE
// transcript box straight back over `transcriptions.raw_text`. Nothing had gone
// wrong in production only because nobody had edited the box yet: the
// "immutable source transcript" guarantee was a convention, not a mechanism.
//
// The distinction needs no schema change. `raw_text` and `corrected_text`
// already mean exactly the two things required, and `structureReportTranscript`
// already prefers the working copy. Only the WRITE path was wrong.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const PROVIDER_OUTPUT =
  "Scanner cérébral, pas d'hémorragie intracrânienne, présence d'une petite lésion " +
  'hypodense frontale droite mesurant 8 mm, je corrige 9 mm.'

describe('the source transcript only ever moves in one direction', () => {
  it('the first capture becomes the source', () => {
    expect(nextSourceTranscript('', PROVIDER_OUTPUT)).toBe(PROVIDER_OUTPUT)
  })

  it('continued dictation extends it', () => {
    const more = `${PROVIDER_OUTPUT} Pas d'effet de masse.`
    expect(nextSourceTranscript(PROVIDER_OUTPUT, more)).toBe(more)
  })

  it('a clinician edit does NOT rewrite it', () => {
    // The doctor tidies the transcript box: the marker goes, the value changes.
    const edited =
      "Scanner cérébral, pas d'hémorragie intracrânienne, présence d'une petite lésion " +
      'hypodense frontale droite mesurant 9 mm.'
    expect(nextSourceTranscript(PROVIDER_OUTPUT, edited)).toBe(PROVIDER_OUTPUT)
  })

  it('a truncation does NOT rewrite it', () => {
    expect(nextSourceTranscript(PROVIDER_OUTPUT, 'Scanner cérébral.')).toBe(PROVIDER_OUTPUT)
  })

  it('clearing the box does NOT erase it', () => {
    expect(nextSourceTranscript(PROVIDER_OUTPUT, '')).toBe(PROVIDER_OUTPUT)
    expect(nextSourceTranscript(PROVIDER_OUTPUT, '   ')).toBe(PROVIDER_OUTPUT)
  })

  it('re-whitespacing is continuation, not an edit', () => {
    const respaced = PROVIDER_OUTPUT.replace(/ /g, '  ')
    expect(nextSourceTranscript(PROVIDER_OUTPUT, respaced)).toBe(respaced)
  })

  it('a changed word is an edit even when the length matches', () => {
    const swapped = PROVIDER_OUTPUT.replace('droite', 'gauche')
    expect(nextSourceTranscript(PROVIDER_OUTPUT, swapped)).toBe(PROVIDER_OUTPUT)
  })

  it('multiple provider passes still accumulate', () => {
    // The append rule is unchanged; the two rules compose.
    const second = 'Deuxième dictée. Rate de taille normale.'
    const combined = appendTranscriptPass(PROVIDER_OUTPUT, second)
    expect(combined).toContain(PROVIDER_OUTPUT)
    expect(combined).toContain(second)
    expect(nextSourceTranscript(PROVIDER_OUTPUT, combined)).toBe(combined)
  })
})

describe('the save path actually uses the rule', () => {
  const code = read('src/lib/actions/report-dictation.ts')

  it('saveReportTranscript routes raw_text through nextSourceTranscript', () => {
    expect(code).toContain("import { nextSourceTranscript } from '@/lib/dictation/transcription-state'")
    expect(code).toMatch(/raw_text:\s*nextSourceTranscript\(/)
  })

  it('it reads the stored source before deciding', () => {
    expect(code).toMatch(/\.select\('id, raw_text'\)/)
  })

  it('structuring still reads the working copy in preference', () => {
    // corrected_text is the reviewed text; raw_text is the fallback and the
    // evidence. Reversing this would structure text the doctor had corrected.
    expect(code).toMatch(/corrected_text as string\)\s*\|\|\s*\(tr\?\.raw_text as string\)/)
  })
})

describe('structuring never mutates the source it was given', () => {
  it('runStructuring returns the raw transcript byte-for-byte', () => {
    const out = runStructuring({
      rawTranscript: PROVIDER_OUTPUT, modality: 'CT', bodyPart: 'Cerveau',
      patientName: '', patientAge: '', patientSex: '',
    })
    expect(out.rawTranscript).toBe(PROVIDER_OUTPUT)
  })

  it('the working text may differ — that is the point of keeping both', () => {
    const { corrected } = detectSelfCorrections(PROVIDER_OUTPUT)
    expect(corrected).not.toBe(PROVIDER_OUTPUT)
    expect(corrected).toContain('9 mm')
    // …while the source still records what was actually spoken.
    expect(PROVIDER_OUTPUT).toContain('8 mm')
    expect(PROVIDER_OUTPUT).toContain('je corrige')
  })
})
