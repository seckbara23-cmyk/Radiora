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
// clear target — the ORIGINAL finding is preserved and a review suggestion
// (CorrectionEvent.applied === false) is emitted instead. It never adds words.
// Bare "plutôt" is intentionally NOT treated as a corrector — in radiology it is
// usually a qualifier ("plutôt hypoéchogène") — and bare "correction" is NOT an
// inline marker either ("correction de scoliose" is legitimate surgical
// history). Every action is recorded as a CorrectionEvent for side-by-side
// review.
//
// ─── R2.7C — what production proved ──────────────────────────────────────────
//
// The first real dictation through the phone → STT → structuring path was:
//
//   "… présence d'une petite lésion hypodense frontale droite mesurant 8 mm,
//    je corrige 9 mm, aspect possiblement séculaire à corréler au contexte
//    clinique."
//
// The marker was found and the target measurement was present and unique, yet
// the correction was REFUSED, because the replacement parser required the
// replacement to be a BARE measurement and this one carried the doctor's
// continuing dictation with it. Two changes follow, and they are the reason
// this module was reopened:
//
//   A. A replacement is read as "the new value, then whatever the doctor kept
//      saying". The value replaces the old one; the continuation stays attached
//      to the finding. Spelled-out units and numbers ("9 millimètres", "neuf
//      millimètres"), a restated value ("elle mesure 9 mm") and a trailing "…"
//      are all recognised as the same thing.
//
//   B. AN UNRESOLVED CORRECTION IS NEVER CLINICAL PROSE. Refusing to resolve is
//      safe; printing "8 mm, je corrige 9 mm" into RÉSULTATS is not — it is
//      exactly the malformed output R2.7C was opened to kill. When the engine
//      refuses, the ORIGINAL finding stays in the section and the replacement
//      travels on the CorrectionEvent as a proposal. No words are lost: the raw
//      transcript is immutable and the event is persisted and displayed.
//
//      This deliberately supersedes the R0.3 rule that preserved the whole
//      sentence verbatim, marker included. R0.3 was right that nothing may be
//      DELETED; it was wrong that the marker could stay in a clinical section.
//
//   C. A correction targets the NEAREST preceding clause, not the whole
//      accumulated sentence — see `splitClauses`. Ambiguity inside that clause
//      still refuses.

import { splitSentences, splitClauses, fold } from '@/lib/ai/sentences'
import type { CorrectionEvent } from '@/types/structuring'

/** A whole short clause that signals "retract what I just said". */
const STANDALONE_RETRACTION =
  /^(?:non|pardon|correction|erreur|je\s+corrige|je\s+me\s+corrige|je\s+reprends|c'est\s+faux)\s*[.!?]*$/i

/** Inline "replace what I just said" markers. Bare "correction" was removed
 *  (R0.3): it fires on legitimate medical wording ("correction de scoliose",
 *  "après correction de la coarctation") and destroyed surgical history. */
const INLINE_REPLACEMENT =
  /\b(?:ou\s+plut[oô]t|non\s+plut[oô]t|je\s+me\s+corrige|je\s+corrige|remplacez?\s+par|remplacer\s+par)\b\s*[:,]?\s*/i

// ─── Measurement vocabulary ───────────────────────────────────────────────────
//
// R2.7C: recognition, not normalisation. A measurement is only ever RECOGNISED
// here so it can be swapped; the text written into the report is copied
// verbatim from what the doctor said. "neuf millimètres" is never rewritten to
// "9 mm" — that would be the engine putting its own words in a clinical section.

/** French number words, longest alternatives first so "dix-sept" beats "dix". */
const NUM_WORD =
  '(?:z[ée]ro|dix[-\\s]?sept|dix[-\\s]?huit|dix[-\\s]?neuf|quatre[-\\s]?vingts?|' +
  'quatorze|quinze|seize|onze|douze|treize|dix|vingt|trente|quarante|cinquante|' +
  'soixante|cent|une?|deux|trois|quatre|cinq|six|sept|huit|neuf)' +
  '(?:[-\\s](?:et[-\\s])?(?:une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze))?'

const NUM = `(?:\\d+(?:[.,]\\d+)?|${NUM_WORD})`

/** Units. Spelled forms first so an abbreviation cannot claim their prefix. */
const UNIT =
  '(?:millim[eè]tres?|centim[eè]tres?|millilitres?|centilitres?|m[eè]tres?|' +
  'degr[ée]s?|pour[-\\s]?cents?|mm³|cm³|mm3|cm3|mm|cm|ml|cc|m|%|°)'

/**
 * A complete measurement: a value (or a "12 x 8" pair) followed by a unit.
 * The trailing guard stops the one-letter unit `m` from matching the first
 * letter of an ordinary word ("8 masses").
 */
const MEASURE = `\\b${NUM}(?:\\s*[x×]\\s*${NUM})*\\s*${UNIT}(?![a-zA-ZÀ-ÿ])`

/** Every measurement in a span. */
const MEASUREMENT_GLOBAL = new RegExp(MEASURE, 'gi')

/** A replacement that is nothing but a measurement. */
const MEASUREMENT_ONLY = new RegExp(`^${MEASURE}$`, 'i')

/** Trailing measurement, for the inline single-sentence localizer. */
const MEASUREMENT_TAIL = new RegExp(`(${MEASURE})\\s*$`, 'i')

/** A measurement opening a replacement, with whatever follows it. */
const MEASUREMENT_LEAD = new RegExp(`^\\s*(${MEASURE})`, 'i')

/** Laterality and the words that qualify it. */
const LATERALITY_GLOBAL =
  /\b(?:droite?s?|gauches?|bilat[ée]rales?|bilat[ée]ral|m[ée]diane?s?)\b/gi

/**
 * A laterality opening a replacement. It must END the replacement or be
 * followed by a separator: "gauche" and "gauche, à hauteur de L3" are laterality
 * swaps, while "gauche du lobe supérieur" is left to the clause path, exactly as
 * before R2.7C.
 */
const LATERALITY_LEAD =
  /^\s*(?:[àa]\s+)?(droite?|gauche|bilat[ée]rale?|m[ée]diane?)(?=\s*(?:$|[,;:]))/i

/**
 * Words a doctor uses to RESTATE a value rather than to state a new finding:
 * "je corrige, elle mesure 9 mm". Deliberately a CLOSED list — any word outside
 * it means the replacement carries clinical content of its own, and the
 * correction falls back to the (guarded) whole-clause path. Stored accent-folded.
 */
const RESTATEMENT_WORDS = new Set([
  'elle', 'il', 'elles', 'ils', 'c', 'ce', "c'est", 'cest', 'cela', 'ca',
  'le', 'la', 'les', 'l', 'de', 'd', 'du', 'des', 'a', 'est', 'sont',
  'fait', 'font', 'mesure', 'mesures', 'mesurant', 'mesurent',
  'environ', 'exactement', 'plus', 'precisement', 'en', 'realite',
  'plutot', 'soit', 'non', 'taille', 'diametre', 'qui', 'que', 'plutôt',
])

// R2.7C — "…" (U+2026) is emitted by real transcription providers and was not
// stripped, which alone was enough to make a clean correction unresolvable.
function stripTrailingPunct(s: string): string {
  return s.replace(/[.!?……]+$/, '').trim()
}

function capitalize(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

function matchesOf(text: string, re: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]
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

// ─── R2.6/R2.7C: resolving a correction against its target ────────────────────
//
// "Nodule du lobe supérieur droit mesurant 12 mm. Je corrige, 14 mm."
//
// The correction and its target are in DIFFERENT sentences. Before R2.6 the
// replacement was appended as a new clause, leaving the report saying both
// 12 mm and 14 mm — and for "Présence d'épanchement. Je corrige, absence
// d'épanchement." it left both polarities standing, which is worse.
//
// Resolution is preservation-first and refuses ambiguity: a correction is only
// applied when the target is UNIQUE in the nearest clause that contains one.

export type ResolveOutcome =
  /** A unique target was found and replaced. */
  | { status: 'applied'; text: string; removed: string; inserted: string }
  /** More than one candidate — never guess which lesion the doctor meant. */
  | { status: 'ambiguous'; reason: 'multiple_measurements' | 'multiple_laterality' }
  /** Not a targeted correction; the replacement supersedes the whole clause. */
  | { status: 'clause' }

/** The new value the doctor dictated, plus everything they said after it. */
interface Replacement {
  /** The token that replaces the old one — copied verbatim. */
  value: string
  /** The continuing dictation, separator and all. Re-attached, never dropped. */
  rest: string
}

/**
 * R2.7C(A) — read a replacement that OPENS with a measurement.
 *
 * "9 mm, aspect possiblement séculaire à corréler au contexte clinique"
 *   → value "9 mm", rest ", aspect possiblement séculaire à corréler…"
 *
 * A second measurement in the tail means this is a compound correction rather
 * than one value plus a continuation, so it is refused: which measurement
 * replaces which is exactly the kind of guess this module does not make.
 */
function leadMeasurement(repl: string): Replacement | null {
  const m = repl.match(MEASUREMENT_LEAD)
  if (!m) return null
  const rest = repl.slice(m[0].length)
  if (matchesOf(rest, MEASUREMENT_GLOBAL).length > 0) return null
  if (INLINE_REPLACEMENT.test(rest) || STANDALONE_RETRACTION.test(rest.trim())) return null
  return { value: m[1].trim(), rest }
}

/**
 * R2.7C(A) — a replacement that RESTATES the value: "elle mesure 9 mm".
 *
 * Accepted only when every word around the single measurement is in the closed
 * RESTATEMENT_WORDS list, so a replacement carrying any clinical content of its
 * own can never be silently reduced to a number swap.
 */
function restatedMeasurement(repl: string): Replacement | null {
  const found = matchesOf(repl, MEASUREMENT_GLOBAL)
  if (found.length !== 1) return null
  const hit = found[0]
  const around = `${repl.slice(0, hit.index!)} ${repl.slice(hit.index! + hit[0].length)}`
  const words = around.split(/[\s'’,;:.()]+/).map((w) => fold(w)).filter(Boolean)
  if (words.length === 0) return null // a bare measurement — leadMeasurement's job
  if (words.some((w) => !RESTATEMENT_WORDS.has(w))) return null
  return { value: hit[0].trim(), rest: '' }
}

/** R2.7C(A) — the laterality equivalent of `leadMeasurement`. */
function leadLaterality(repl: string): Replacement | null {
  const m = repl.match(LATERALITY_LEAD)
  if (!m) return null
  const rest = repl.slice(m[0].length)
  if (matchesOf(rest, LATERALITY_GLOBAL).length > 0) return null
  if (INLINE_REPLACEMENT.test(rest)) return null
  return { value: m[1], rest }
}

type Candidate = { at: number; text: string } | 'ambiguous' | null

/**
 * R2.7C(C) — find the correction's target in the NEAREST preceding clause that
 * has one, scanning backwards. Ambiguity is judged INSIDE that clause: an
 * unrelated measurement several clauses earlier is not a competing target, but
 * two candidates in the clause the doctor just spoke still refuse.
 */
function nearestCandidate(target: string, re: RegExp): Candidate {
  const clauses = splitClauses(target)
  for (let i = clauses.length - 1; i >= 0; i--) {
    const found = matchesOf(clauses[i].text, re)
    if (found.length === 0) continue
    if (found.length > 1) return 'ambiguous'
    return { at: clauses[i].start + found[0].index!, text: found[0][0] }
  }
  return null
}

function swap(target: string, hit: { at: number; text: string }, r: Replacement): ResolveOutcome {
  const replaced = target.slice(0, hit.at) + r.value + target.slice(hit.at + hit.text.length)
  return {
    status: 'applied',
    // The continuation is re-attached exactly as dictated, separator included.
    text: `${replaced}${r.rest}`.replace(/\s+$/, ''),
    removed: hit.text.trim(),
    inserted: r.value,
  }
}

/**
 * Resolve a correction whose replacement follows the clause it corrects.
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

  // (a) measurement → measurement, carrying any continuation with it.
  const measurement = leadMeasurement(repl) ?? restatedMeasurement(repl)
  if (measurement) {
    const hit = nearestCandidate(target, MEASUREMENT_GLOBAL)
    if (hit === null) return { status: 'clause' }
    if (hit === 'ambiguous') return { status: 'ambiguous', reason: 'multiple_measurements' }
    return swap(target, hit, measurement)
  }

  // (b) laterality → laterality
  const side = leadLaterality(repl)
  if (side) {
    const hit = nearestCandidate(target, LATERALITY_GLOBAL)
    if (hit === null) return { status: 'clause' }
    if (hit === 'ambiguous') return { status: 'ambiguous', reason: 'multiple_laterality' }
    return swap(target, hit, side)
  }

  return { status: 'clause' }
}

/**
 * R0.3 — try to localize an inline replacement to the smallest safe target.
 * Returns null when no safe localization exists (the caller then preserves the
 * ORIGINAL finding and raises a suggestion).
 *
 * Measurement and laterality are handled by `resolveCorrectionTarget` before
 * this is reached. What remains here are the two shapes it does not cover:
 *
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

  // (a) measurement ↔ measurement — kept for the bare-tail case.
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
 *
 * Returns the corrected transcript plus the list of correction events — applied
 * edits (`applied: true`) and held-back proposals (`applied: false`). For a
 * held-back proposal `removed` is the ORIGINAL finding, which stays in the
 * transcript, and `kept` is the replacement, which does NOT (R2.7C rule B).
 * Raw-transcript provenance is the caller's concern: the engine stores the
 * untouched raw text alongside this output.
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
  // R2.7C(B) — a retraction the engine refused to act on. The sentence that
  // follows it is the proposal; it is recorded on the event and never written
  // into clinical text beside the finding it was meant to replace.
  let held: { removed: string; marker: string; index: number } | null = null

  for (const s of sentences) {
    const bare = stripTrailingPunct(s.text)

    if (held) {
      events.push({
        marker:  held.marker,
        removed: held.removed,
        kept:    bare,
        index:   held.index,
        applied: false,
      })
      held = null
      continue
    }

    // Case 1 — standalone retraction ("Non.", "Je corrige.")
    if (STANDALONE_RETRACTION.test(bare)) {
      const prev     = kept.length > 0 ? kept[kept.length - 1] : ''
      const prevBare = stripTrailingPunct(prev)

      // R0.3 — "Question ? Non." is an ANSWER, not a retraction: deleting it
      // would erase a dictated negative finding. It is genuine clinical content,
      // so unlike every other refusal path it stays in the text.
      if (prev && /\?\s*$/.test(prev.trim())) {
        kept.push(s.text)
        events.push({ marker: bare.toLowerCase(), removed: prevBare, kept: '', index: s.start, applied: false })
        continue
      }

      // A multi-finding or long clause is never deleted automatically. The
      // finding stays; the retraction and its replacement become a proposal.
      if (prev && isTooMeaningfulToDrop(prevBare)) {
        held = { removed: prevBare, marker: bare.toLowerCase(), index: s.start }
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
      const resolved = resolveCorrectionTarget(awaiting.removed, bare)

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
        // it would be a guess about which lesion the doctor meant. R2.7C(B) —
        // the replacement is a proposal, not a second finding.
        kept.push(`${awaiting.removed}${awaiting.punct}`)
        events.push({
          marker:  awaiting.marker,
          removed: awaiting.removed,
          kept:    bare,
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
        kept:    bare,
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

          // R2.7C(B) — ambiguous, or a whole-clause replacement the preservation
          // guards refuse: the finding stays, the proposal travels on the event.
          if (
            resolved.status === 'ambiguous' ||
            /\?\s*$/.test(prev.trim()) ||
            isTooMeaningfulToDrop(prevBare)
          ) {
            events.push({
              marker,
              removed: prevBare,
              kept:    stripTrailingPunct(after),
              index:   s.start + m.index,
              applied: false,
            })
            continue
          }

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
        // R2.7C — THE PRODUCTION CASE. `before` ends at the value being
        // corrected; `after` opens with the new value and may carry the rest of
        // the sentence with it.
        const beforeBare = before.replace(/[,;:]+$/, '').trim()
        const punct      = after.match(/[.!?……]+$/)?.[0] ?? '.'
        const resolved   = resolveCorrectionTarget(beforeBare, after)

        if (resolved.status === 'applied') {
          kept.push(`${capitalize(resolved.text)}${punct}`)
          events.push({
            marker:  m[0].trim().toLowerCase(),
            removed: resolved.removed,
            kept:    resolved.inserted,
            index:   s.start + m.index,
            applied: true,
          })
          continue
        }

        if (resolved.status !== 'ambiguous') {
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
        }

        // R2.7C(B) — no safe target. The ORIGINAL finding is kept; the marker
        // and the unresolved replacement never become clinical prose.
        kept.push(`${beforeBare}${punct}`)
        events.push({
          marker:  m[0].trim().toLowerCase(),
          removed: beforeBare,
          kept:    stripTrailingPunct(after),
          index:   s.start + m.index,
          applied: false,
        })
        continue
      }
    }

    kept.push(s.text)
  }

  // A retraction with no replacement after it still holds back the correction.
  if (held) {
    events.push({ marker: held.marker, removed: held.removed, kept: '', index: held.index, applied: false })
  }

  const corrected = kept.join(' ').replace(/\s+/g, ' ').trim()
  return { corrected, events }
}
