// Feature 7 — self-correction detection.
//
// Radiologists routinely retract themselves mid-dictation:
//   "Pas d'épanchement pleural. Non. Fine lame pleurale gauche."
// The final intent is "Fine lame pleurale gauche." — the earlier clause was
// withdrawn by the spoken "Non.".
//
// SAFETY (R0.3 — preservation-first): this only ever DROPS text the doctor
// unambiguously retracted, and only when the retraction can be LOCALIZED to a
// short, single-finding clause or a single comparable token/measurement. When
// the intended correction cannot be safely localized — a multi-finding
// sentence, an answer to a dictated question, a multi-word replacement with no
// clear target — the original text is preserved VERBATIM and a review
// suggestion (CorrectionEvent.applied === false) is emitted instead. It never
// adds words. Bare "plutôt" is intentionally NOT treated as a corrector — in
// radiology it is usually a qualifier ("plutôt hypoéchogène") — and bare
// "correction" is NOT an inline marker either ("correction de scoliose" is
// legitimate surgical history). Every action is recorded as a CorrectionEvent
// for side-by-side review.

import { splitSentences } from '@/lib/ai/sentences'
import type { CorrectionEvent } from '@/types/structuring'

/** A whole short clause that signals "retract what I just said". */
const STANDALONE_RETRACTION =
  /^(?:non|pardon|correction|erreur|je\s+corrige|je\s+me\s+corrige|je\s+reprends|c'est\s+faux)\s*[.!?]*$/i

/** Inline "replace what I just said" markers. Bare "correction" was removed
 *  (R0.3): it fires on legitimate medical wording ("correction de scoliose",
 *  "après correction de la coarctation") and destroyed surgical history. */
const INLINE_REPLACEMENT =
  /\b(?:ou\s+plut[oô]t|non\s+plut[oô]t|je\s+me\s+corrige|je\s+corrige|remplacez?\s+par|remplacer\s+par)\b\s*[:,]?\s*/i

/** Trailing measurement: number (int or decimal) + optional unit. */
const MEASUREMENT_TAIL =
  /(\d+(?:[.,]\d+)?\s*(?:mm³|cm³|mm3|cm3|ml|cc|mm|cm|m|%|°)?)\s*$/i

/** A replacement that is nothing but a measurement. */
const MEASUREMENT_ONLY =
  /^\d+(?:[.,]\d+)?\s*(?:mm³|cm³|mm3|cm3|ml|cc|mm|cm|m|%|°)?$/i

function stripTrailingPunct(s: string): string {
  return s.replace(/[.!?]+$/, '').trim()
}

function capitalize(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/** A clause carrying more than one finding (commas/semicolons) or a long one
 *  is too meaningful to delete automatically — preserve it and flag instead. */
function isTooMeaningfulToDrop(bare: string): boolean {
  if (/[,;]/.test(bare)) return true
  return bare.split(/\s+/).filter(Boolean).length > 8
}

/** Morphological cousins ("hyperéchogène" / "hypoéchogène") share a long
 *  prefix or suffix — the only case where a one-word-for-many swap is safe. */
function sharesMorphology(a: string, b: string): boolean {
  const na = a.toLowerCase()
  const nb = b.toLowerCase()
  if (na === nb) return false
  let prefix = 0
  while (prefix < na.length && prefix < nb.length && na[prefix] === nb[prefix]) prefix++
  let suffix = 0
  while (
    suffix < na.length - prefix && suffix < nb.length - prefix &&
    na[na.length - 1 - suffix] === nb[nb.length - 1 - suffix]
  ) suffix++
  return prefix >= 5 || suffix >= 5
}

interface Localized {
  text:     string  // the rewritten sentence
  removed:  string  // exactly what was replaced
  inserted: string  // exactly what replaced it
}

// ─── R2.6: cross-sentence correction targets ──────────────────────────────────
//
// "Nodule du lobe supérieur droit mesurant 12 mm. Je corrige, 14 mm."
//
// The correction and its target are in DIFFERENT sentences. Before R2.6 the
// replacement was appended as a new clause, leaving the report saying both
// 12 mm and 14 mm — and for "Présence d'épanchement. Je corrige, absence
// d'épanchement." it left both polarities standing, which is worse.
//
// Resolution is preservation-first and refuses ambiguity: a correction is only
// applied when the target is UNIQUE in the preceding clause.

/** Measurements, including "12 x 8 mm" pairs and both decimal separators. */
const MEASUREMENT_GLOBAL =
  /\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)*\s*(?:mm³|cm³|mm3|cm3|ml|cc|mm|cm|m|%|°)/gi

/** Laterality and the words that qualify it. */
const LATERALITY_GLOBAL =
  /\b(?:droite?s?|gauches?|bilat[ée]rales?|bilat[ée]ral|m[ée]diane?s?)\b/gi

const LATERALITY_ONLY =
  /^(?:[àa]\s+)?(?:droite?|gauche|bilat[ée]rale?|m[ée]dian[e]?)$/i

export type ResolveOutcome =
  /** A unique target was found and replaced. */
  | { status: 'applied'; text: string; removed: string; inserted: string }
  /** More than one candidate — never guess which lesion the doctor meant. */
  | { status: 'ambiguous'; reason: 'multiple_measurements' | 'multiple_laterality' }
  /** Not a targeted correction; the replacement supersedes the whole clause. */
  | { status: 'clause' }

function matchesOf(text: string, re: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]
}

/**
 * Resolve a correction whose replacement is in the NEXT sentence against the
 * clause it corrects.
 *
 * Only two things are targeted surgically, because only these two can be
 * matched without understanding the sentence: a measurement and a laterality.
 * Anything else is treated as a replacement of the whole clause, which the
 * caller then guards with its own preservation rules.
 */
export function resolveCorrectionTarget(previousClause: string, replacement: string): ResolveOutcome {
  const target = stripTrailingPunct(previousClause).trim()
  const repl   = stripTrailingPunct(replacement).trim()
  if (!target || !repl) return { status: 'clause' }

  // (a) measurement → measurement
  if (MEASUREMENT_ONLY.test(repl) || /^\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)+\s*\w*$/i.test(repl)) {
    const found = matchesOf(target, MEASUREMENT_GLOBAL)
    if (found.length === 0) return { status: 'clause' }
    if (found.length > 1) return { status: 'ambiguous', reason: 'multiple_measurements' }
    const hit = found[0]
    const at  = hit.index!
    return {
      status: 'applied',
      text: target.slice(0, at) + repl + target.slice(at + hit[0].length),
      removed: hit[0].trim(),
      inserted: repl,
    }
  }

  // (b) laterality → laterality
  if (LATERALITY_ONLY.test(repl)) {
    const word = repl.replace(/^[àa]\s+/i, '')
    const found = matchesOf(target, LATERALITY_GLOBAL)
    if (found.length === 0) return { status: 'clause' }
    if (found.length > 1) return { status: 'ambiguous', reason: 'multiple_laterality' }
    const hit = found[0]
    const at  = hit.index!
    return {
      status: 'applied',
      text: target.slice(0, at) + word + target.slice(at + hit[0].length),
      removed: hit[0].trim(),
      inserted: word,
    }
  }

  return { status: 'clause' }
}

/**
 * R0.3 — try to localize an inline replacement to the smallest safe target.
 * Returns null when no safe localization exists (caller preserves verbatim).
 *
 *   (a) measurement → measurement:  "… mesurant 12 mm, ou plutôt 14 mm."
 *       swaps only the trailing measurement, keeping lesion identity,
 *       laterality and location intact;
 *   (b) single-word replacement:    "… du lobe droit, ou plutôt gauche."
 *       swaps exactly one word for one word;
 *   (c) morphological variant:      "… hyperéchogène ou plutôt hypoéchogène du foie."
 *       swaps the last word for the whole replacement when its first word is a
 *       clear variant (shared prefix/suffix ≥ 5 chars) of the word it replaces.
 */
function localizeInlineReplacement(before: string, after: string): Localized | null {
  const beforeBare = before.replace(/[,;:]+$/, '').trim()
  const afterBare  = stripTrailingPunct(after)
  if (!beforeBare || !afterBare) return null
  const punct = after.match(/[.!?]+$/)?.[0] ?? ''

  // (a) measurement ↔ measurement
  const measTail = beforeBare.match(MEASUREMENT_TAIL)
  if (measTail && measTail.index !== undefined && MEASUREMENT_ONLY.test(afterBare)) {
    const head = beforeBare.slice(0, measTail.index).trimEnd()
    if (head) {
      return { text: `${head} ${afterBare}${punct}`, removed: measTail[1].trim(), inserted: afterBare }
    }
  }

  const lastWordMatch = beforeBare.match(/(\S+)$/)
  if (!lastWordMatch || lastWordMatch.index === undefined) return null
  const lastWord = lastWordMatch[1]
  const head     = beforeBare.slice(0, lastWordMatch.index).trimEnd()
  if (!head) return null

  // (b) one word for one word
  if (/^\S+$/.test(afterBare)) {
    return { text: `${head} ${afterBare}${punct}`, removed: lastWord, inserted: afterBare }
  }

  // (c) morphological variant carries the rest of the replacement with it
  const firstAfter = afterBare.split(/\s+/)[0]
  if (sharesMorphology(lastWord, firstAfter)) {
    return { text: `${head} ${afterBare}${punct}`, removed: lastWord, inserted: afterBare }
  }

  return null
}

/**
 * Resolves dictated self-corrections (preservation-first).
 * Returns the corrected transcript plus the list of correction events —
 * applied edits (`applied: true`) and preserved-for-review suggestions
 * (`applied: false`). Raw-transcript provenance is the caller's concern: the
 * engine stores the untouched raw text alongside this output.
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
  let awaiting: { removed: string; punct: string; marker: string; index: number } | null = null

  for (const s of sentences) {
    const bare = stripTrailingPunct(s.text)

    // Case 1 — standalone retraction ("Non.", "Je corrige.")
    if (STANDALONE_RETRACTION.test(bare)) {
      const prev     = kept.length > 0 ? kept[kept.length - 1] : ''
      const prevBare = stripTrailingPunct(prev)

      // R0.3 — "Question ? Non." is an ANSWER, not a retraction: deleting it
      // would erase a dictated negative finding. Preserve verbatim + flag.
      // Likewise a multi-finding/long clause is never deleted automatically.
      if (prev && (/\?\s*$/.test(prev.trim()) || isTooMeaningfulToDrop(prevBare))) {
        kept.push(s.text)
        events.push({
          marker:  bare.toLowerCase(),
          removed: prevBare,
          kept:    '',
          index:   s.start,
          applied: false,
        })
        continue
      }

      const removed = kept.pop() ?? ''
      awaiting = {
        removed: stripTrailingPunct(removed),
        punct:   removed.match(/[.!?]+$/)?.[0] ?? '.',
        marker:  bare.toLowerCase(),
        index:   s.start,
      }
      continue
    }

    // Case 2 — this sentence is the replacement that follows a retraction.
    if (awaiting) {
      // R2.6 — "Nodule du lobe supérieur droit de 12 mm. Non. 14 mm." replaces
      // only the measurement. Replacing the whole clause would throw away the
      // lesion, its lobe and its laterality to keep a bare number.
      const resolved = resolveCorrectionTarget(awaiting.removed, stripTrailingPunct(s.text))

      if (resolved.status === 'applied') {
        kept.push(`${resolved.text}${awaiting.punct}`)
        events.push({
          marker:  awaiting.marker,
          removed: resolved.removed,
          kept:    resolved.inserted,
          index:   awaiting.index,
          applied: true,
        })
        awaiting = null
        continue
      }

      if (resolved.status === 'ambiguous') {
        // Put the retracted clause back: with two candidate targets, deleting
        // it would be a guess about which lesion the doctor meant.
        kept.push(`${awaiting.removed}${awaiting.punct}`)
        kept.push(s.text)
        events.push({
          marker:  awaiting.marker,
          removed: awaiting.removed,
          kept:    stripTrailingPunct(s.text),
          index:   awaiting.index,
          applied: false,
        })
        awaiting = null
        continue
      }

      kept.push(s.text)
      events.push({
        marker:  awaiting.marker,
        removed: awaiting.removed,
        kept:    stripTrailingPunct(s.text),
        index:   awaiting.index,
        applied: true,
      })
      awaiting = null
      continue
    }

    // Case 3 — inline replacement inside one sentence ("… ou plutôt …").
    const m = s.text.match(INLINE_REPLACEMENT)
    if (m && m.index !== undefined) {
      const before = s.text.slice(0, m.index).trim()
      const after  = s.text.slice(m.index + m[0].length).trim()

      if (after && !before) {
        // R2.6 — the marker opens the sentence, so the target is the PREVIOUS
        // clause. Before R2.6 this appended the replacement as a new sentence,
        // leaving "… 12 mm. 14 mm." in the report — and, worse, leaving both
        // "Présence d'épanchement" and "absence d'épanchement" standing.
        const prev     = kept.length > 0 ? kept[kept.length - 1] : ''
        const prevBare = stripTrailingPunct(prev)
        const marker   = m[0].trim().toLowerCase()
        const punct    = prev.match(/[.!?]+$/)?.[0] ?? '.'

        if (prev) {
          const resolved = resolveCorrectionTarget(prevBare, after)

          if (resolved.status === 'applied') {
            // Surgical: only the measurement or the laterality changed. Lesion
            // identity, location and everything else are untouched.
            kept[kept.length - 1] = `${resolved.text}${punct}`
            events.push({
              marker,
              removed: resolved.removed,
              kept:    resolved.inserted,
              index:   s.start + m.index,
              applied: true,
            })
            continue
          }

          if (resolved.status === 'ambiguous') {
            // Two candidate lesions. Never guess which one — preserve both the
            // original and the correction, and raise it for review.
            kept.push(s.text)
            events.push({
              marker,
              removed: prevBare,
              kept:    stripTrailingPunct(after),
              index:   s.start + m.index,
              applied: false,
            })
            continue
          }

          // Whole-clause replacement. Same preservation guards as a standalone
          // retraction: an answer to a question or a multi-finding clause is
          // too meaningful to delete automatically.
          if (!/\?\s*$/.test(prev.trim()) && !isTooMeaningfulToDrop(prevBare)) {
            kept.pop()
            kept.push(capitalize(after))
            events.push({
              marker,
              removed: prevBare,
              kept:    stripTrailingPunct(after),
              index:   s.start + m.index,
              applied: true,
            })
            continue
          }

          kept.push(s.text)
          events.push({
            marker,
            removed: prevBare,
            kept:    stripTrailingPunct(after),
            index:   s.start + m.index,
            applied: false,
          })
          continue
        }

        // Nothing before it — dropping just the marker is safe.
        kept.push(capitalize(after))
        events.push({
          marker,
          removed: '',
          kept:    stripTrailingPunct(after),
          index:   s.start + m.index,
          applied: true,
        })
        continue
      }

      if (after && before) {
        const localized = localizeInlineReplacement(before, after)
        if (localized) {
          kept.push(capitalize(localized.text))
          events.push({
            marker:  m[0].trim().toLowerCase(),
            removed: localized.removed,
            kept:    localized.inserted,
            index:   s.start + m.index,
            applied: true,
          })
          continue
        }
        // R0.3 — no safe target: preserve the whole sentence verbatim and
        // surface a review suggestion rather than deleting the preceding
        // clause (which carried lesion identity / laterality / location).
        kept.push(s.text)
        events.push({
          marker:  m[0].trim().toLowerCase(),
          removed: stripTrailingPunct(before),
          kept:    stripTrailingPunct(after),
          index:   s.start + m.index,
          applied: false,
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
