// F15 — Vocabulary memory: pure, deterministic helpers.
//
// Radiora learns each radiologist's preferred wording from the corrections they
// make to a transcript, then SUGGESTS those terms next time. Two hard safety
// rules are enforced here, in pure code, so they can be unit-tested:
//
//   1. Vocabulary never modifies clinical MEANING. A learned pair is rejected if
//      it adds/removes an uncertainty or negation marker, or changes a number —
//      i.e. it must be a wording/spelling change only.
//   2. Nothing is auto-applied. We only ever return SUGGESTIONS (like the static
//      medical-term corrections); the radiologist confirms each one.
//
// No IO, no AI, no network.

export type VocabularyKind = 'word' | 'phrase' | 'spelling' | 'terminology' | 'conclusion'

export interface VocabularyPair {
  source: string
  target: string
  kind: VocabularyKind
}

export interface VocabularyEntryLite {
  id?: string
  source: string
  target: string
  confidence?: number
}

export interface VocabularyMatch {
  entryId?: string
  /** Preferred term (what we suggest). */
  term: string
  original: string
  replacement: string
  startIndex: number
  endIndex: number
  confidence: number
}

// ── normalization ────────────────────────────────────────────────────────────

/** Lowercase, collapse whitespace, trim. Diacritics are KEPT (medical meaning). */
export function normalizeVocab(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Accent + case insensitive token key, for comparing whether two tokens match. */
function tokenKey(token: string): string {
  return token
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[.,;:!?()«»"']/g, '')
}

// ── confidence ───────────────────────────────────────────────────────────────

/** Confidence grows with how often a correction has been confirmed (caps at 1). */
export function vocabularyConfidence(frequency: number): number {
  if (frequency <= 0) return 0
  return Math.min(1, Math.round((frequency / 5) * 100) / 100)
}

// ── protected clinical meaning ───────────────────────────────────────────────

// Uncertainty / negation / hedging markers whose presence changes meaning. If the
// before/after of a learned pair disagree on any of these, the pair is unsafe.
const PROTECTED_MARKERS: RegExp[] = [
  /\bprobable?s?\b/i,
  /\bpossibles?\b/i,
  /\bsuspect[ée]?s?\b/i,
  /\b[ée]voqu/i,
  /\bcompatible/i,
  /\bdouteu/i,
  /\b[ée]ventuel/i,
  /\bne peut[\s-]+(?:pas\s+)?[êe]tre\s+(?:exclu|[ée]limin)/i,
  /\bne\s+peut\b/i,
  /\bpas\s+d[e']/i,
  /\babsence\b/i,
  /\bsans\b/i,
  /\baucun[e]?\b/i,
  /\bnon\b/i,
  /\bn[e']\s*\w+\s+pas\b/i,
]

function markerSignature(text: string): string {
  return PROTECTED_MARKERS.map((re) => (re.test(text) ? '1' : '0')).join('')
}

function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'))
}

/**
 * True when turning `source` into `target` would alter clinical meaning rather
 * than just wording: a difference in any uncertainty/negation marker, or any
 * change to the numbers present. Such pairs must never be learned or suggested.
 */
export function changesClinicalMeaning(source: string, target: string): boolean {
  if (markerSignature(source) !== markerSignature(target)) return true
  const a = numbers(source).sort()
  const b = numbers(target).sort()
  return a.length !== b.length || a.some((n, i) => n !== b[i])
}

// ── learning (diff a before/after edit into vocabulary pairs) ─────────────────

function tokenize(text: string): string[] {
  return text.match(/\S+/g) ?? []
}

// Longest-common-subsequence alignment of two token lists (by accent/case-folded
// key), returning the contiguous differing runs as [sourceRun, targetRun] pairs.
function diffRuns(before: string[], after: string[]): Array<[string[], string[]]> {
  const n = before.length
  const m = after.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        tokenKey(before[i]) === tokenKey(after[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const runs: Array<[string[], string[]]> = []
  let i = 0
  let j = 0
  let srcRun: string[] = []
  let tgtRun: string[] = []
  const flush = () => {
    if (srcRun.length || tgtRun.length) runs.push([srcRun, tgtRun])
    srcRun = []
    tgtRun = []
  }
  while (i < n && j < m) {
    if (tokenKey(before[i]) === tokenKey(after[j])) {
      flush()
      // Same token by accent/case-folded key but a different surface form is a
      // spelling/accent correction (e.g. "adenopathie" → "adénopathie").
      if (normalizeVocab(before[i]) !== normalizeVocab(after[j])) {
        runs.push([[before[i]], [after[j]]])
      }
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      srcRun.push(before[i++])
    } else {
      tgtRun.push(after[j++])
    }
  }
  while (i < n) srcRun.push(before[i++])
  while (j < m) tgtRun.push(after[j++])
  flush()
  return runs
}

const MAX_RUN_WORDS = 5

/**
 * Extract candidate vocabulary pairs from a radiologist's edit (raw transcript →
 * corrected text). Only short, meaning-preserving wording changes are kept.
 */
export function learnCorrectionPairs(before: string, after: string): VocabularyPair[] {
  const pairs: VocabularyPair[] = []
  const seen = new Set<string>()

  for (const [srcRun, tgtRun] of diffRuns(tokenize(before), tokenize(after))) {
    if (!srcRun.length || !tgtRun.length) continue // pure insertion/deletion isn't a substitution
    if (srcRun.length > MAX_RUN_WORDS || tgtRun.length > MAX_RUN_WORDS) continue

    const source = normalizeVocab(srcRun.join(' '))
    const target = tgtRun.join(' ').replace(/\s+/g, ' ').trim()
    if (!source || !target) continue
    if (normalizeVocab(target) === source) continue // identical after folding
    if (changesClinicalMeaning(source, target)) continue // SAFETY: meaning change

    const key = `${source}→${normalizeVocab(target)}`
    if (seen.has(key)) continue
    seen.add(key)

    const kind: VocabularyKind = srcRun.length === 1 && tgtRun.length === 1 ? 'word' : 'phrase'
    pairs.push({ source, target, kind })
  }

  return pairs
}

// ── applying (suggestions only) ──────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Scan `text` for known vocabulary sources and return SUGGESTED replacements,
 * sorted by position with no overlaps. Never auto-applied; meaning-changing
 * entries are skipped defensively even if one slipped into storage.
 */
export function findVocabularyMatches(text: string, entries: VocabularyEntryLite[]): VocabularyMatch[] {
  const matches: VocabularyMatch[] = []

  for (const entry of entries) {
    const source = normalizeVocab(entry.source)
    const target = entry.target.trim()
    if (!source || !target) continue
    if (changesClinicalMeaning(source, target)) continue

    const re = new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m[0] === target) continue // already the preferred form
      matches.push({
        entryId: entry.id,
        term: target,
        original: m[0],
        replacement: target,
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        confidence: entry.confidence ?? 0,
      })
      if (re.lastIndex === m.index) re.lastIndex++
    }
  }

  matches.sort((a, b) => a.startIndex - b.startIndex)

  // Drop overlaps, keeping the earliest (then highest-confidence) match.
  const out: VocabularyMatch[] = []
  let lastEnd = -1
  for (const match of matches) {
    if (match.startIndex >= lastEnd) {
      out.push(match)
      lastEnd = match.endIndex
    }
  }
  return out
}
