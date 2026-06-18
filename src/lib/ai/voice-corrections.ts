/**
 * Static French radiology medical term correction dictionary.
 * Maps common Web Speech API transcription errors to the correct medical term.
 *
 * Corrections are phrasing/terminology only — never diagnostic content.
 * All corrections require explicit user confirmation before being applied.
 */

export interface VoiceCorrection {
  /** Short label for display (the corrected term) */
  term: string
  /** Regex pattern that matches the STT error */
  pattern: RegExp
  /** Replacement string (uses regex capture groups if needed) */
  replacement: string
}

export const MEDICAL_CORRECTIONS: VoiceCorrection[] = [
  // ── Hepatic / abdominal ──────────────────────────────────────────────────
  { term: 'hépatosplénomégalie',    pattern: /\bhépa\s+to\s+spléno\s+mégalie\b/gi,         replacement: 'hépatosplénomégalie' },
  { term: 'hépatomégalie',          pattern: /\bhépa\s+to\s+mégalie\b/gi,                   replacement: 'hépatomégalie' },
  { term: 'splénomégalie',          pattern: /\bspléno\s+mégalie\b/gi,                       replacement: 'splénomégalie' },
  { term: 'cholécystite',           pattern: /\bcholécy\s+stite\b/gi,                        replacement: 'cholécystite' },
  { term: 'cholélithiase',          pattern: /\bcholé\s+lithiase\b/gi,                       replacement: 'cholélithiase' },
  { term: 'pancréatite',            pattern: /\bpancré\s+a\s+tite\b/gi,                      replacement: 'pancréatite' },
  { term: 'appendicite',            pattern: /\bappen\s+di\s+cite\b/gi,                      replacement: 'appendicite' },
  { term: 'péritonite',             pattern: /\bpéri\s+to\s+nite\b/gi,                       replacement: 'péritonite' },

  // ── Cardiac / vascular ──────────────────────────────────────────────────
  { term: 'anévrisme',              pattern: /\bané\s+vrisme\b/gi,                           replacement: 'anévrisme' },
  { term: 'athérosclérose',         pattern: /\bathéro\s+sclé\s+rose\b/gi,                   replacement: 'athérosclérose' },
  { term: 'thrombose',              pattern: /\bthrom\s+bose\b/gi,                           replacement: 'thrombose' },
  { term: 'embolie',                pattern: /\bemboli[ée]\b/gi,                              replacement: 'embolie' },
  { term: 'péricardite',            pattern: /\bpéri\s+car\s+dite\b/gi,                      replacement: 'péricardite' },
  { term: 'cardiomégalie',          pattern: /\bcardio\s+mégalie\b/gi,                       replacement: 'cardiomégalie' },

  // ── Pulmonary ────────────────────────────────────────────────────────────
  { term: 'pneumothorax',           pattern: /\bpneumo\s+thorax\b/gi,                        replacement: 'pneumothorax' },
  { term: 'épanchement pleural',    pattern: /\bépanche\s+ment\s+pleural\b/gi,               replacement: 'épanchement pleural' },
  { term: 'pleurésie',              pattern: /\bpleuré\s+sie\b/gi,                           replacement: 'pleurésie' },
  { term: 'bronchectasie',          pattern: /\bbronchec\s+ta\s+sie\b/gi,                    replacement: 'bronchectasie' },
  { term: 'atélectasie',            pattern: /\baté\s+lec\s+ta\s+sie\b/gi,                   replacement: 'atélectasie' },

  // ── Neurological ─────────────────────────────────────────────────────────
  { term: 'hémorragie',             pattern: /\bhémor\s+ragie\b/gi,                          replacement: 'hémorragie' },
  { term: 'hématome',               pattern: /\bhéma\s+tome\b/gi,                            replacement: 'hématome' },
  { term: 'hydrocéphalie',          pattern: /\bhydro\s+cépha\s+lie\b/gi,                    replacement: 'hydrocéphalie' },
  { term: 'méningiome',             pattern: /\bménin\s+giome\b/gi,                          replacement: 'méningiome' },
  { term: 'encéphalite',            pattern: /\bencépha\s+lite\b/gi,                         replacement: 'encéphalite' },
  { term: 'ischémique',             pattern: /\bis\s+ché\s+mique\b/gi,                       replacement: 'ischémique' },

  // ── Musculoskeletal ──────────────────────────────────────────────────────
  { term: 'ostéoporose',            pattern: /\bosté\s+o\s+po\s+rose\b/gi,                   replacement: 'ostéoporose' },
  { term: 'ostéonécrose',           pattern: /\bosté\s+o\s+né\s+crose\b/gi,                  replacement: 'ostéonécrose' },
  { term: 'spondylodiscite',        pattern: /\bspondy\s+lo\s+dis\s+cite\b/gi,               replacement: 'spondylodiscite' },
  { term: 'arthropathie',           pattern: /\barthropa\s+thie\b/gi,                        replacement: 'arthropathie' },
  { term: 'méniscopathie',          pattern: /\bménisco\s+pathie\b/gi,                       replacement: 'méniscopathie' },
  { term: 'chondropathie',          pattern: /\bchondro\s+pathie\b/gi,                       replacement: 'chondropathie' },

  // ── Lymphatic / oncology ─────────────────────────────────────────────────
  { term: 'adénopathie',            pattern: /\badéno\s+pathie\b/gi,                         replacement: 'adénopathie' },
  { term: 'adénome',                pattern: /\badé\s+nome\b/gi,                             replacement: 'adénome' },
  { term: 'lymphadénopathie',       pattern: /\blympha\s+déno\s+pathie\b/gi,                 replacement: 'lymphadénopathie' },

  // ── Renal / urological ───────────────────────────────────────────────────
  { term: 'hydronéphrose',          pattern: /\bhydro\s+né\s+phrose\b/gi,                    replacement: 'hydronéphrose' },
  { term: 'pyélonéphrite',          pattern: /\bpyélo\s+né\s+phrite\b/gi,                    replacement: 'pyélonéphrite' },
  { term: 'urolithiase',            pattern: /\buro\s+lithiase\b/gi,                         replacement: 'urolithiase' },
  { term: 'vésiculolithiase',       pattern: /\bvésico\s+lithiase\b/gi,                      replacement: 'vésiculolithiase' },

  // ── Thyroid / neck ────────────────────────────────────────────────────────
  { term: 'goitre',                 pattern: /\bgoî\s+tre\b/gi,                              replacement: 'goitre' },
  { term: 'thyroïdite',             pattern: /\bthyroï\s+dite\b/gi,                          replacement: 'thyroïdite' },

  // ── Radiology terms ──────────────────────────────────────────────────────
  { term: 'rehaussement',           pattern: /\brehaus\s+se\s+ment\b/gi,                     replacement: 'rehaussement' },
  { term: 'hyposignal',             pattern: /\bhypo\s+signal\b/gi,                          replacement: 'hyposignal' },
  { term: 'hypersignal',            pattern: /\bhyper\s+signal\b/gi,                         replacement: 'hypersignal' },
  { term: 'hypodense',              pattern: /\bhypo\s+dense\b/gi,                           replacement: 'hypodense' },
  { term: 'hyperdense',             pattern: /\bhyper\s+dense\b/gi,                          replacement: 'hyperdense' },
  { term: 'isodense',               pattern: /\biso\s+dense\b/gi,                            replacement: 'isodense' },
  { term: 'mammographie',           pattern: /\bmammo\s+graphie\b/gi,                        replacement: 'mammographie' },
  { term: 'scintigraphie',          pattern: /\bscinti\s+graphie\b/gi,                       replacement: 'scintigraphie' },

  // ── Common French homophones / confusion ─────────────────────────────────
  { term: 'sans anomalie',          pattern: /\bsens\s+anomalie\b/gi,                        replacement: 'sans anomalie' },
  { term: 'sans épanchement',       pattern: /\bsens\s+épanchement\b/gi,                     replacement: 'sans épanchement' },
  { term: 'sans lésion',            pattern: /\bsens\s+lésion\b/gi,                          replacement: 'sans lésion' },
  { term: "n'est pas",              pattern: /\bnais\s+pas\b/gi,                              replacement: "n'est pas" },
]

export interface DetectedCorrection {
  term:        string
  original:    string
  replacement: string
  startIndex:  number
  endIndex:    number
}

/**
 * Scans transcript text for known medical term STT errors.
 * Returns a list of suggested corrections — never auto-applied.
 */
export function findMedicalCorrections(text: string): DetectedCorrection[] {
  const corrections: DetectedCorrection[] = []
  const seen = new Set<string>()

  for (const correction of MEDICAL_CORRECTIONS) {
    correction.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = correction.pattern.exec(text)) !== null) {
      const key = `${match.index}-${correction.term}`
      if (seen.has(key)) continue
      seen.add(key)
      corrections.push({
        term:        correction.term,
        original:    match[0],
        replacement: correction.replacement,
        startIndex:  match.index,
        endIndex:    match.index + match[0].length,
      })
    }
  }

  return corrections.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Applies a single correction to the text.
 */
export function applyCorrection(text: string, correction: DetectedCorrection): string {
  return text.slice(0, correction.startIndex) + correction.replacement + text.slice(correction.endIndex)
}

/**
 * Applies all corrections at once (adjusts offsets as we go).
 */
export function applyAllCorrections(text: string, corrections: DetectedCorrection[]): string {
  let result = text
  let offset = 0
  for (const c of corrections) {
    const start = c.startIndex + offset
    const end   = c.endIndex   + offset
    result = result.slice(0, start) + c.replacement + result.slice(end)
    offset += c.replacement.length - c.original.length
  }
  return result
}
