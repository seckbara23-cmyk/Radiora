// Feature 7 — French medical cleanup engine.
//
// Removes dictation noise (fillers, immediate repetitions) and normalizes
// radiology terminology, while PRESERVING every clinically meaningful word —
// negations ("pas", "sans", "non"), uncertainty ("probable", "possible",
// "suspicion", "ne peut être exclu") and measurements are never touched.
//
// Senegal / francophone-African dictation is the target; the normalization
// dictionary lives in voice-corrections.ts (MEDICAL_CORRECTIONS) and is
// expandable. This engine is purely local — no model, no network.

import { findMedicalCorrections, applyAllCorrections } from '@/lib/ai/voice-corrections'
import type { RemovedToken } from '@/types/structuring'

interface FillerRule {
  re:    RegExp
  label: string
}

// Discourse fillers with no clinical content. Word-bounded and conservative.
// NB: none of these overlap negation/uncertainty vocabulary.
const FILLERS: FillerRule[] = [
  { re: /\b(?:euh+|heu+|hum+|hmm+|mmh+|bah+|ben)\b/gi,        label: 'euh' },
  { re: /\bdu\s+coup\b/gi,                                     label: 'du coup' },
  { re: /\ben\s+fait\b/gi,                                     label: 'en fait' },
  { re: /\bvous\s+voyez\b/gi,                                  label: 'vous voyez' },
  { re: /\bcomment\s+dire\b/gi,                                label: 'comment dire' },
  { re: /\bvoil[aà]\b/gi,                                      label: 'voilà' },
  // "donc" / "alors" as discourse glue — but keep "alors que".
  { re: /\b(?:donc|alors)\b(?!\s+que)/gi,                      label: 'donc' },
]

function removeMatches(text: string, rule: FillerRule, sink: RemovedToken[]): string {
  rule.re.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = rule.re.exec(text)) !== null) {
    sink.push({ text: match[0], reason: 'filler', index: match.index })
    if (match.index === rule.re.lastIndex) rule.re.lastIndex++ // guard zero-width
  }
  return text.replace(rule.re, ' ')
}

/**
 * Collapse immediate word/short-phrase repetitions:
 *   "le le foie" → "le foie", "pas de pas de" → "pas de".
 * Only whitespace-separated immediate repeats (a dictation artifact) — repeats
 * across punctuation are left alone, since they may be intentional.
 */
function collapseRepetitions(text: string, sink: RemovedToken[]): string {
  const re = /\b([\p{L}'][\p{L}'-]*(?:\s+[\p{L}'][\p{L}'-]*){0,3})(?:\s+\1\b)+/giu
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    sink.push({ text: match[0], reason: 'repetition', index: match.index })
  }
  return text.replace(re, '$1')
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')      // no space before punctuation
    .replace(/,(?:\s*,)+/g, ',')          // collapse comma runs left by removals
    .replace(/([.!?])\s*,/g, '$1')        // drop comma right after a sentence end
    .replace(/,\s*([.!?])/g, '$1')        // drop comma right before a sentence end
    .replace(/(^|[.!?]\s*),\s*/g, '$1')   // drop comma at the start of a sentence
    .replace(/([,.;:!?])(?=\S)/g, '$1 ')  // one space after punctuation
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim()
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+|\n\s*)([a-zà-ÿ])/g, (_, lead, ch) => lead + ch.toUpperCase())
}

/**
 * Cleans a (already self-corrected) French transcript.
 * Returns the cleaned text and the list of removed tokens, for transparency.
 */
export function cleanupFrench(input: string): { cleaned: string; removed: RemovedToken[] } {
  const removed: RemovedToken[] = []
  let text = input ?? ''
  if (!text.trim()) return { cleaned: '', removed }

  // 1. Normalize known radiology terminology (terminology only — never findings).
  const corrections = findMedicalCorrections(text)
  if (corrections.length) text = applyAllCorrections(text, corrections)

  // 2. Strip fillers.
  for (const rule of FILLERS) text = removeMatches(text, rule, removed)

  // 3. Collapse immediate repetitions.
  text = collapseRepetitions(text, removed)

  // 4. Whitespace/punctuation tidy + sentence casing.
  text = tidy(text)
  text = capitalizeSentences(text)

  // 5. Ensure the text ends on a terminator if it has content.
  if (text && !/[.!?]$/.test(text)) text += '.'

  return { cleaned: text, removed }
}
