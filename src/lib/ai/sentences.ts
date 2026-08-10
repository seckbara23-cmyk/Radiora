// R2.6 — one sentence splitter for the whole structuring pipeline.
//
// Self-correction, section routing and duplication detection all need to cut a
// transcript into clauses, and they must cut it the SAME way: a boundary that
// one module sees and another does not is how a correction ends up applied to
// the wrong finding. This module is that single definition.
//
// The rule that matters clinically: a '.' flanked by digits is a decimal
// separator, never a sentence boundary. "3.5 cm" is one measurement; splitting
// it produces "3." and "5 cm", and a report that says a lesion measures 5 cm
// when the doctor said 3.5 cm is a serious error.

export interface Sentence {
  /** Trimmed sentence text, terminator included. */
  text: string
  /** Character offset of the sentence start in the source string. */
  start: number
  /** Character offset one past the sentence end. */
  end: number
}

function isDigit(ch: string | undefined): boolean {
  return !!ch && ch >= '0' && ch <= '9'
}

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      // Decimal separator, not a boundary.
      if (ch === '.' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue
      const raw = text.slice(start, i + 1)
      if (raw.trim()) out.push({ text: raw.trim(), start, end: i + 1 })
      start = i + 1
    }
  }
  if (start < text.length) {
    const raw = text.slice(start)
    if (raw.trim()) out.push({ text: raw.trim(), start, end: text.length })
  }
  return out
}

/** Accent- and case-folded, whitespace-collapsed. For comparison only. */
export function fold(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fold plus punctuation stripped — for "is this the same clause?" checks. */
export function foldClause(s: string): string {
  return fold(s).replace(/[.,;:!?]+/g, '').replace(/\s+/g, ' ').trim()
}

// Each accent-folded base letter → a class that also matches its accented
// French variants, so a pattern built from a FOLDED keyword still matches the
// ORIGINAL accented text. Matching the original means clinical content is never
// sliced from a normalised copy and keeps its accents verbatim.
const ACCENT_CLASS: Record<string, string> = {
  a: 'aàâä', c: 'cç', e: 'eéèêë', i: 'iîï',
  o: 'oôö', u: 'uùûü', y: 'yÿ', n: 'nñ',
}

const REGEX_SPECIAL = /[-[\]{}()*+?.,\\^$|#]/

/**
 * Turn an accent-folded keyword into an accent- and case-insensitive regex
 * fragment: foldable letters expand to their variant class, whitespace runs
 * become `\s+`, and metacharacters are escaped.
 */
export function accentInsensitivePattern(foldedKeyword: string): string {
  let out = ''
  let prevSpace = false
  for (const ch of foldedKeyword) {
    if (/\s/.test(ch)) {
      if (!prevSpace) out += '\\s+'
      prevSpace = true
      continue
    }
    prevSpace = false
    const cls = ACCENT_CLASS[ch]
    if (cls) out += `[${cls}]`
    else if (REGEX_SPECIAL.test(ch)) out += `\\${ch}`
    else out += ch
  }
  return out
}
