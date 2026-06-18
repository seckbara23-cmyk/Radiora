// Feature 10 — medical uncertainty preservation.
//
// Radiology language is deliberately hedged: "probable", "suspicion de",
// "ne peut être exclu" carry clinical meaning that MUST survive every automated
// pass (self-correction, French cleanup, structuring). Converting a hedge into a
// certainty — or dropping it — is a patient-safety defect, not a cosmetic one.
//
// This module is pure and deterministic. It does not rewrite text; it only
// detects the protected vocabulary so other layers can guarantee they preserved
// it (see assertUncertaintyPreserved) and so the UI can highlight it.

/** Strip accents + lowercase so matching is robust to dictation accent loss. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

interface UncertaintyTerm {
  id: string
  /** Canonical French label, shown in the UI. */
  label: string
  /** Matched against the ACCENT-STRIPPED text. Flexible inner whitespace. */
  pattern: RegExp
}

// The protected vocabulary. Patterns run on normalize()'d text, so they are
// written without accents and tolerate elision ("d'") and extra spacing.
export const UNCERTAINTY_TERMS: UncertaintyTerm[] = [
  { id: 'probable',          label: 'probable',            pattern: /\bprobables?\b/ },
  { id: 'possible',          label: 'possible',            pattern: /\bpossibles?\b/ },
  { id: 'compatible_avec',   label: 'compatible avec',     pattern: /\bcompatibles?\s+avec\b/ },
  { id: 'en_faveur_de',      label: 'en faveur de',        pattern: /\ben\s+faveur\s+d(?:e|u|es|')\b/ },
  { id: 'suspicion_de',      label: 'suspicion de',        pattern: /\bsuspicions?\s+d(?:e|')\b/ },
  { id: 'a_confirmer',       label: 'à confirmer',         pattern: /\ba\s+confirmer\b/ },
  { id: 'a_discuter',        label: 'à discuter',          pattern: /\ba\s+discuter\b/ },
  { id: 'ne_peut_etre_exclu',label: 'ne peut être exclu',  pattern: /\bne\s+peut\s+(?:pas\s+)?etre\s+exclu(?:e|s|es)?\b/ },
  { id: 'evocateur_de',      label: 'aspect évocateur de', pattern: /\b(?:aspect\s+)?evocateur(?:s)?\s+d(?:e|'|es)\b/ },
]

/** IDs of every protected term that appears at least once in `text`. */
export function findUncertaintyTerms(text: string): string[] {
  const n = normalize(text)
  const found: string[] = []
  for (const term of UNCERTAINTY_TERMS) {
    if (term.pattern.test(n)) found.push(term.id)
  }
  return found
}

/** Human-readable labels for the protected terms present in `text`. */
export function uncertaintyLabels(text: string): string[] {
  const ids = new Set(findUncertaintyTerms(text))
  return UNCERTAINTY_TERMS.filter((t) => ids.has(t.id)).map((t) => t.label)
}

/**
 * Returns the protected terms that were present in `before` but are MISSING from
 * `after` — i.e. an automated pass silently weakened the report's hedging.
 * An empty array means uncertainty was preserved. Presence-based (not count-based)
 * so that collapsing a stutter ("probable probable" → "probable") is not a loss.
 */
export function lostUncertaintyTerms(before: string, after: string): string[] {
  const had   = new Set(findUncertaintyTerms(before))
  const kept  = new Set(findUncertaintyTerms(after))
  return [...had].filter((id) => !kept.has(id))
}

/** True when every protected term in `before` still appears in `after`. */
export function preservesUncertainty(before: string, after: string): boolean {
  return lostUncertaintyTerms(before, after).length === 0
}
