import { describe, it, expect } from 'vitest'
import { detectSelfCorrections } from '@/lib/ai/self-correction'
import { runStructuring } from '@/lib/ai/structuring-engine'

// R2.7C — the FIRST real dictation through phone → STT → structuring.
//
// This is not a synthetic case. It is the exact `transcriptions.raw_text` from
// the production run, together with the exact `correction_events` row it
// produced, which recorded `applied: false` and left the correction marker
// standing inside RÉSULTATS:
//
//   {"marker":"je corrige","applied":false,
//    "removed":"Scanner cérébral, … mesurant 8 mm,",
//    "kept":"9 mm, aspect possiblement séculaire à corréler au contexte clinique"}
//
// The target measurement was present and UNIQUE. The correction was refused
// only because the replacement carried the doctor's continuing dictation with
// it, and the parser required a bare measurement.
//
// Every assertion below is about clinical meaning, not about implementation.

const PRODUCTION_RAW =
  "Scanner cérébral, pas d'hémorragie intracrânienne, pas d'effet de masse, " +
  "présence d'une petite lésion hypodense frontale droite mesurant 8 mm, " +
  "je corrige 9 mm, aspect possiblement séculaire à corréler au contexte clinique. " +
  "Conclusion, absence d'anomalies intracrâniennes aiguës, " +
  "petite lésion frontale droite d'allurement probablement séculaire."

const structured = (raw: string) =>
  runStructuring({
    rawTranscript: raw,
    modality: 'CT',
    bodyPart: 'Cerveau',
    patientName: 'TEST R2.7C SYNTHETIQUE',
    patientAge: '46 ans',
    patientSex: 'Masculin',
    locale: 'fr',
  })

describe('R2.7C — the production dictation resolves correctly', () => {
  const { corrected, events } = detectSelfCorrections(PRODUCTION_RAW)
  const out = structured(PRODUCTION_RAW)

  it('detects the correction', () => {
    expect(events).toHaveLength(1)
    expect(events[0].marker).toContain('je corrige')
  })

  it('resolves the measurement target uniquely and applies it', () => {
    expect(events[0].applied).toBe(true)
    expect(events[0].removed).toBe('8 mm')
    expect(events[0].kept).toBe('9 mm')
  })

  it('RÉSULTATS carries the corrected measurement', () => {
    expect(out.structured.results).toContain('9 mm')
  })

  it('the retracted 8 mm does not survive anywhere in the report', () => {
    expect(out.structured.results).not.toContain('8 mm')
    expect(out.structured.conclusion).not.toContain('8 mm')
    expect(corrected).not.toContain('8 mm')
  })

  it('the correction marker never becomes clinical prose', () => {
    for (const section of [
      out.structured.indication,
      out.structured.technique,
      out.structured.results,
      out.structured.conclusion,
      out.structured.recommendations ?? '',
    ]) {
      expect(section.toLowerCase()).not.toContain('je corrige')
    }
  })

  it('the continuation the doctor kept dictating stays attached to the finding', () => {
    expect(out.structured.results).toContain(
      'aspect possiblement séculaire à corréler au contexte clinique',
    )
  })

  it('produces exactly the clinically intended sentence', () => {
    expect(corrected).toContain(
      "présence d'une petite lésion hypodense frontale droite mesurant 9 mm, " +
      'aspect possiblement séculaire à corréler au contexte clinique.',
    )
  })

  it('laterality survives the measurement correction', () => {
    expect(out.structured.results).toContain('frontale droite')
  })

  it('both dictated negations survive intact', () => {
    expect(out.structured.results).toContain("pas d'hémorragie intracrânienne")
    expect(out.structured.results).toContain("pas d'effet de masse")
  })

  it('the explicit CONCLUSION header still routes the conclusion', () => {
    expect(out.structured.conclusion).toContain("absence d'anomalies intracrâniennes aiguës")
    expect(out.structured.conclusion).toContain('petite lésion frontale droite')
    // …and does not leak back into RÉSULTATS.
    expect(out.structured.results).not.toContain("absence d'anomalies intracrâniennes")
  })

  it('the raw transcript is returned byte-for-byte unchanged', () => {
    expect(out.rawTranscript).toBe(PRODUCTION_RAW)
    // The working text is allowed — required, here — to differ from it.
    expect(out.cleanedTranscript).not.toBe(PRODUCTION_RAW)
  })

  it('no word in RÉSULTATS is absent from what the doctor actually said', () => {
    // The engine never invents. Every clinical word traces back to the raw text.
    const said = new Set(
      PRODUCTION_RAW.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter(Boolean),
    )
    const printed = out.structured.results.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter(Boolean)
    for (const word of printed) expect(said.has(word), word).toBe(true)
  })
})
