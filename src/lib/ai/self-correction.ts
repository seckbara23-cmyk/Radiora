// Feature 7 — self-correction detection.
//
// Radiologists routinely retract themselves mid-dictation:
//   "Pas d'épanchement pleural. Non. Fine lame pleurale gauche."
// The final intent is "Fine lame pleurale gauche." — the earlier clause was
// withdrawn by the spoken "Non.".
//
// SAFETY: this only ever DROPS text the doctor retracted; it never adds words.
// It acts only on UNAMBIGUOUS markers (a standalone retraction, or an explicit
// "remplacez par" / "je corrige" / "ou plutôt"). Bare "plutôt" is intentionally
// NOT treated as a corrector — in radiology it is usually a qualifier
// ("plutôt hypoéchogène"), and a wrong deletion is worse than a missed one.
// Every action is recorded as a CorrectionEvent for side-by-side review.

import type { CorrectionEvent } from '@/types/structuring'

interface Sentence {
  text:  string
  start: number
}

function splitSentences(text: string): Sentence[] {
  const res: Sentence[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      const seg = text.slice(start, i + 1)
      if (seg.trim()) res.push({ text: seg.trim(), start })
      start = i + 1
    }
  }
  if (start < text.length) {
    const seg = text.slice(start)
    if (seg.trim()) res.push({ text: seg.trim(), start })
  }
  return res
}

/** A whole short clause that signals "retract what I just said". */
const STANDALONE_RETRACTION =
  /^(?:non|pardon|correction|erreur|je\s+corrige|je\s+me\s+corrige|je\s+reprends|c'est\s+faux)\s*[.!?]*$/i

/** Inline "drop everything before me, keep what follows" markers. */
const INLINE_REPLACEMENT =
  /\b(?:ou\s+plut[oô]t|non\s+plut[oô]t|je\s+me\s+corrige|je\s+corrige|remplacez?\s+par|remplacer\s+par|correction)\b\s*[:,]?\s*/i

function stripTrailingPunct(s: string): string {
  return s.replace(/[.!?]+$/, '').trim()
}

function capitalize(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/**
 * Resolves dictated self-corrections.
 * Returns the corrected transcript plus the list of applied corrections.
 */
export function detectSelfCorrections(raw: string): {
  corrected: string
  events:    CorrectionEvent[]
} {
  const text = raw.trim()
  if (!text) return { corrected: '', events: [] }

  const sentences = splitSentences(text)
  const kept: string[] = []
  const events: CorrectionEvent[] = []
  let awaiting: { removed: string; marker: string; index: number } | null = null

  for (const s of sentences) {
    const bare = stripTrailingPunct(s.text)

    // Case 1 — standalone retraction ("Non.", "Je corrige.")
    if (STANDALONE_RETRACTION.test(bare)) {
      const removed = kept.pop() ?? ''
      awaiting = { removed: stripTrailingPunct(removed), marker: bare.toLowerCase(), index: s.start }
      continue
    }

    // Case 2 — this sentence is the replacement that follows a retraction.
    if (awaiting) {
      kept.push(s.text)
      events.push({
        marker:  awaiting.marker,
        removed: awaiting.removed,
        kept:    stripTrailingPunct(s.text),
        index:   awaiting.index,
      })
      awaiting = null
      continue
    }

    // Case 3 — inline replacement inside one sentence ("… ou plutôt …").
    const m = s.text.match(INLINE_REPLACEMENT)
    if (m && m.index !== undefined) {
      const before = s.text.slice(0, m.index).trim()
      const after  = s.text.slice(m.index + m[0].length).trim()
      if (after) {
        kept.push(capitalize(after))
        events.push({
          marker:  m[0].trim().toLowerCase(),
          removed: stripTrailingPunct(before),
          kept:    stripTrailingPunct(after),
          index:   s.start + m.index,
        })
        continue
      }
    }

    kept.push(s.text)
  }

  // A trailing retraction with no replacement still removes the prior clause.
  const corrected = kept.join(' ').replace(/\s+/g, ' ').trim()
  return { corrected, events }
}
