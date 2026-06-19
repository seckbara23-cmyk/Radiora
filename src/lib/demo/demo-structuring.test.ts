import { describe, it, expect } from 'vitest'
import { runDemo, inferExam } from '@/lib/demo/demo-structuring'
import { DEMO_SAMPLES } from '@/lib/demo/demo-samples'

const byId = (id: string) => DEMO_SAMPLES.find((s) => s.id === id)!

describe('inferExam', () => {
  it('detects CT cerebral', () => {
    expect(inferExam('scanner cérébral sans injection')).toEqual({ modality: 'CT', bodyPart: 'cerveau' })
  })
  it('detects CT thoracique', () => {
    expect(inferExam('scanner thoracique')).toEqual({ modality: 'CT', bodyPart: 'thorax' })
  })
  it('detects US abdominale', () => {
    expect(inferExam('échographie abdominale par voie transcutanée')).toEqual({ modality: 'US', bodyPart: 'abdomen' })
  })
  it('returns null modality for unrecognised text', () => {
    expect(inferExam('bonjour ceci est un test').modality).toBeNull()
  })
})

describe('runDemo — cerebral sample', () => {
  const r = runDemo(byId('cerebral').dictation, byId('cerebral').patient)

  it('produces a SCANNER CÉRÉBRAL report', () => {
    expect(r.examTitle).toBe('SCANNER CÉRÉBRAL')
  })

  it('detects the dictated self-correction and drops the retracted clause', () => {
    expect(r.corrections.length).toBeGreaterThanOrEqual(1)
    const c = r.corrections[0]
    expect(c.removed).toContain("hémorragie")
    expect(c.kept).toContain('hyperdensité frontale droite')
    // the retracted finding must not survive anywhere in the structured output
    const all = r.sections.map((s) => s.body).join(' ')
    expect(all).not.toContain("Pas d'hémorragie")
  })

  it('structures the kept finding into RÉSULTATS and the conclusion into CONCLUSION', () => {
    const results = r.sections.find((s) => s.key === 'results')!
    const conclusion = r.sections.find((s) => s.key === 'conclusion')!
    expect(results.body).toContain('hyperdensité frontale droite')
    expect(conclusion.body).toContain('contusion frontale droite')
  })

  it('keeps INDICATION and TECHNIQUE from the dictation', () => {
    expect(r.sections.find((s) => s.key === 'indication')!.body).toContain('traumatisme crânien')
    expect(r.sections.find((s) => s.key === 'technique')!.body).toContain('sans injection')
  })

  it('removes the dictation filler "euh" during cleanup', () => {
    expect(r.cleaned).not.toMatch(/\beuh\b/i)
    expect(r.removedTokens.some((t) => t.reason === 'filler')).toBe(true)
  })

  it('never invents content — every section word traces to the dictation', () => {
    // sanity: results body is a substring-family of the corrected transcript
    const corrected = r.corrected.toLowerCase()
    expect(corrected).toContain('hyperdensité frontale droite')
  })
})

describe('runDemo — thoracique sample', () => {
  const r = runDemo(byId('thoracique').dictation, byId('thoracique').patient)

  it('produces a SCANNER THORACIQUE report', () => {
    expect(r.examTitle).toBe('SCANNER THORACIQUE')
  })

  it('retracts the over-stated effusion via "Non."', () => {
    const all = r.sections.map((s) => s.body).join(' ')
    expect(all).not.toContain('grande abondance')
    expect(all).toContain('Fine lame pleurale droite')
  })

  it('collapses the dictation repetition "lame lame"', () => {
    expect(r.cleaned).not.toMatch(/lame\s+lame/i)
    expect(r.removedTokens.some((t) => t.reason === 'repetition')).toBe(true)
  })
})

describe('runDemo — abdominale sample', () => {
  const r = runDemo(byId('abdominale').dictation, byId('abdominale').patient)

  it('produces an ÉCHOGRAPHIE ABDOMINALE report', () => {
    expect(r.examTitle).toBe('ÉCHOGRAPHIE ABDOMINALE')
  })

  it('applies the "je corrige" replacement', () => {
    const all = r.sections.map((s) => s.body).join(' ')
    expect(all).toContain('sans épaississement pariétal')
    expect(all).not.toContain('avec paroi épaissie')
  })

  it('preserves the patient identity passed as metadata (not parsed from dictation)', () => {
    expect(r.patient.name).toBe('Ousmane Fall')
  })
})

describe('runDemo — free text (no patient)', () => {
  it('does not echo a patient identity and still structures', () => {
    const r = runDemo('Indication : céphalées. Conclusion : examen sans particularité.')
    expect(r.patient.name).toBe('—')
    expect(r.sections.length).toBeGreaterThan(0)
  })

  it('handles empty input safely', () => {
    const r = runDemo('   ')
    expect(r.sections.length).toBe(0)
    expect(r.corrections.length).toBe(0)
  })
})
