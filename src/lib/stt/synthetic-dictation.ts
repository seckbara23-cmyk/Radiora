// R2.7C — the synthetic French radiology dictation used to validate activation.
//
// NON-PHI BY CONSTRUCTION. No real patient, no real study, no real report, no
// real clinician. Nothing here describes a person who exists. It is safe to
// read aloud into a phone during a production activation test, and safe to
// commit.
//
// It exists because "does transcription work?" is not a useful question for a
// clinical product. The useful question is: do the words that CHANGE A
// DIAGNOSIS survive the round trip — negation, laterality, a decimal
// measurement, a spoken correction, and hedging?
//
// What this fixture asserts is deliberately narrow: that Radiora's own
// deterministic pipeline handles these phrases correctly. It makes NO claim
// about any provider's accuracy — that can only be measured against a real
// endpoint, and is recorded in the activation checklist, not here.

export interface SyntheticPhrase {
  /** What the tester says aloud, in French. */
  spoken: string
  /** What it is testing. */
  hazard:
    | 'negation'
    | 'laterality'
    | 'decimal-measurement'
    | 'spoken-correction'
    | 'hedging'
  /**
   * Fragments whose LOSS would change the clinical meaning, checked against the
   * RAW TRANSCRIPT — what the microphone heard, before Radiora touches it.
   *
   * Each entry is a set of ACCEPTABLE ALTERNATIVES: a provider may render
   * "douze virgule cinq" as words or as "12,5", and both are correct
   * transcriptions. Any one of them satisfies the requirement.
   *
   * Compared case- and accent-insensitively: a provider's capitalisation and
   * punctuation are not clinically meaningful, the words are.
   */
  mustSurvive: string[][]
  /** Words that would indicate the meaning was inverted or strengthened. */
  mustNotAppear?: string[]
}

export const SYNTHETIC_DICTATION: SyntheticPhrase[] = [
  {
    spoken: "Pas d'hémorragie intracrânienne.",
    hazard: 'negation',
    mustSurvive: [['hemorragie'], ['intracranienne'], ["pas d'", 'aucune', 'absence']],
    // Losing the negation turns a normal head CT into a bleed.
    mustNotAppear: ["presence d'hemorragie"],
  },
  {
    spoken: 'Nodule du lobe supérieur droit mesurant douze virgule cinq millimètres.',
    hazard: 'decimal-measurement',
    // Word form OR digit form — both are correct transcriptions.
    mustSurvive: [['nodule'], ['lobe superieur'], ['droit'], ['douze virgule cinq', '12,5', '12.5']],
  },
  {
    spoken: 'Je corrige, quatorze millimètres.',
    hazard: 'spoken-correction',
    mustSurvive: [['je corrige'], ['quatorze', '14']],
  },
  {
    spoken: 'Aspect compatible avec une contusion frontale droite.',
    hazard: 'hedging',
    mustSurvive: [['compatible avec'], ['contusion'], ['frontale'], ['droite']],
    // "compatible avec" must never be promoted to a diagnosis.
    mustNotAppear: ['diagnostic de'],
  },
  {
    spoken: "Absence d'épanchement pleural.",
    hazard: 'negation',
    mustSurvive: [['absence'], ['epanchement'], ['pleural']],
    mustNotAppear: ["presence d'epanchement"],
  },
  {
    spoken: 'Lésion rénale droite. Je corrige, gauche.',
    hazard: 'laterality',
    mustSurvive: [['renale'], ['gauche']],
  },
]

/** The whole script, as one dictation. */
export const SYNTHETIC_TRANSCRIPT = SYNTHETIC_DICTATION.map((p) => p.spoken).join(' ')

/**
 * A digit-form variant. A provider may render "douze virgule cinq" either as
 * words or as "12,5" — both are acceptable transcriptions, and the pipeline
 * must handle the digit form correctly since that is what reaches the report.
 */
export const SYNTHETIC_TRANSCRIPT_DIGITS =
  "Pas d'hémorragie intracrânienne. " +
  'Nodule du lobe supérieur droit mesurant 12,5 mm. ' +
  'Je corrige, 14 mm. ' +
  'Aspect compatible avec une contusion frontale droite. ' +
  "Absence d'épanchement pleural. " +
  'Lésion rénale droite. Je corrige, gauche.'

/** Accent- and case-insensitive comparison; punctuation-tolerant. */
export function clinicalFold(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Which hazards lost a clinically meaningful fragment?
 *
 * Applies to the RAW TRANSCRIPT — the provider's own output. It is deliberately
 * NOT the right instrument for the structured report: by then a dictated
 * correction has legitimately REPLACED text ("12,5" becomes "14"), and
 * demanding the superseded value still be present would assert the opposite of
 * what the correction engine is for.
 */
export function survivingHazards(text: string): Array<{ hazard: string; missing: string[] }> {
  const folded = clinicalFold(text)
  return SYNTHETIC_DICTATION.map((p) => ({
    hazard: p.hazard,
    missing: p.mustSurvive
      .filter((alternatives) => !alternatives.some((a) => folded.includes(clinicalFold(a))))
      .map((alternatives) => alternatives.join(' | ')),
  })).filter((r) => r.missing.length > 0)
}

/** Meanings that must never appear — an inverted negation, a promoted hedge. */
export function invertedMeanings(text: string): string[] {
  const folded = clinicalFold(text)
  return SYNTHETIC_DICTATION
    .flatMap((p) => p.mustNotAppear ?? [])
    .filter((fragment) => folded.includes(clinicalFold(fragment)))
}
