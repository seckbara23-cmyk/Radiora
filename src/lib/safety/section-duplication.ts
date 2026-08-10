// R2.6 — cross-section duplication detection and provenance-gated repair.
//
// The same clinical statement appearing in two sections is a reporting error
// even when every word is the doctor's own: it reads as two findings, and a
// clinician skimming CONCLUSION cannot tell whether RÉSULTATS says the same
// thing or something new.
//
// R2.6's section router removes the pass that CREATED such duplicates (see
// section-router.ts). This module is the net underneath: content also arrives
// from applied templates, external-AI appends and legacy reports, and none of
// those go through the router.
//
// Two rules govern everything here:
//
//   • Overlapping WORDS are not duplication. Radiology repeats its vocabulary
//     constantly — "lésion", "droit", "normal" — and flagging that would bury
//     the real cases. Comparison is clause-level.
//   • Nothing is removed unless provenance PROVES the engine put it there.
//     A physician-edited section is never touched, and an ambiguous pair is
//     preserved and flagged.
//
// Pure — no IO, no clock, no network. Clause text is returned for the reviewing
// UI to display in-place; it is never logged.

import { SECTION_ORDER, type SectionKey, type SectionTextMap } from '@/lib/safety/sections'
import { splitSentences, foldClause } from '@/lib/ai/sentences'
import type { SectionProvenance } from '@/lib/ai/section-router'

export type DuplicationKind =
  /** Same clause, ignoring case, accents, punctuation and spacing. */
  | 'exact'
  /** Overwhelmingly the same clause — a rewording, not a new finding. */
  | 'near'
  /** Shared terminology only. Reported for completeness, never acted on. */
  | 'overlap'

export interface DuplicationFinding {
  kind: DuplicationKind
  /** The two sections holding it, in report order. */
  sections: [SectionKey, SectionKey]
  /** The clause as it appears in the FIRST section. For display, not logging. */
  clause: string
}

/** Clause-level duplication needs a real clause, not a two-word fragment. */
const MIN_TOKENS_FOR_NEAR = 4
const NEAR_THRESHOLD = 0.8
const OVERLAP_THRESHOLD = 0.5

function tokens(clause: string): string[] {
  return foldClause(clause).split(' ').filter(Boolean)
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0 || B.size === 0) return 0
  let intersection = 0
  for (const x of A) if (B.has(x)) intersection++
  return intersection / (A.size + B.size - intersection)
}

interface Clause {
  text: string
  folded: string
  tokens: string[]
}

function clausesOf(text: string): Clause[] {
  return splitSentences(text ?? '')
    .map((s) => ({ text: s.text, folded: foldClause(s.text), tokens: tokens(s.text) }))
    .filter((c) => c.folded.length > 0)
}

/**
 * Find clinical statements that appear in more than one section.
 *
 * Returns findings in report order. `overlap` findings are informational: they
 * mean the two clauses share vocabulary, which is normal in radiology.
 */
export function detectSectionDuplication(sections: SectionTextMap): DuplicationFinding[] {
  const byKey = new Map<SectionKey, Clause[]>()
  for (const key of SECTION_ORDER) byKey.set(key, clausesOf(sections[key]))

  const findings: DuplicationFinding[] = []

  for (let i = 0; i < SECTION_ORDER.length; i++) {
    for (let j = i + 1; j < SECTION_ORDER.length; j++) {
      const a = SECTION_ORDER[i]
      const b = SECTION_ORDER[j]
      for (const ca of byKey.get(a)!) {
        for (const cb of byKey.get(b)!) {
          if (ca.folded === cb.folded) {
            findings.push({ kind: 'exact', sections: [a, b], clause: ca.text })
            continue
          }
          // A rewording is only meaningful for a clause with real substance.
          if (ca.tokens.length < MIN_TOKENS_FOR_NEAR || cb.tokens.length < MIN_TOKENS_FOR_NEAR) {
            continue
          }
          const score = jaccard(ca.tokens, cb.tokens)
          if (score >= NEAR_THRESHOLD) {
            findings.push({ kind: 'near', sections: [a, b], clause: ca.text })
          } else if (score >= OVERLAP_THRESHOLD) {
            findings.push({ kind: 'overlap', sections: [a, b], clause: ca.text })
          }
        }
      }
    }
  }

  return findings
}

// ─── Provenance-gated repair ──────────────────────────────────────────────────

/**
 * Provenance strong enough to be the RIGHT home for a clause. `auto_filled` is
 * authoritative for its own section: the protocol template belongs in TECHNIQUE,
 * so a copy of it elsewhere is the copy that is wrong.
 */
const AUTHORITATIVE: SectionProvenance[] = [
  'physician_edit', 'explicit_header', 'semantic', 'auto_filled',
]
/** Provenance that only means "nothing better was known at the time". */
const FALLBACK: SectionProvenance[] = ['continuation', 'inferred']

export interface RepairInput {
  sections: SectionTextMap
  provenance: Partial<Record<SectionKey, SectionProvenance>>
  /** Sections the radiologist owns. Never modified, whatever the provenance. */
  locked?: SectionKey[]
}

export interface RemovedDuplicate {
  section: SectionKey
  keptIn: SectionKey
  clause: string
}

export interface RepairResult {
  sections: SectionTextMap
  /** Fallback copies that provenance proved were engine-placed. */
  removed: RemovedDuplicate[]
  /** Duplication that must be resolved by a human. */
  review: DuplicationFinding[]
}

/**
 * Remove duplicate clauses ONLY where provenance proves which copy is wrong.
 *
 *   authoritative + fallback, neither locked  → drop the fallback copy
 *   either side physician-owned               → keep both, raise for review
 *   both authoritative, or both fallback      → keep both, raise for review
 *
 * `overlap` findings are never acted on — shared vocabulary is not duplication.
 */
export function repairSectionDuplication(input: RepairInput): RepairResult {
  const locked = new Set(input.locked ?? [])
  const sections: SectionTextMap = { ...input.sections }
  const removed: RemovedDuplicate[] = []
  const review: DuplicationFinding[] = []

  for (const finding of detectSectionDuplication(input.sections)) {
    if (finding.kind === 'overlap') continue

    const [a, b] = finding.sections
    if (locked.has(a) || locked.has(b)) {
      review.push(finding)
      continue
    }

    const pa = input.provenance[a]
    const pb = input.provenance[b]
    const aAuthoritative = !!pa && AUTHORITATIVE.includes(pa)
    const bAuthoritative = !!pb && AUTHORITATIVE.includes(pb)
    const aFallback = !!pa && FALLBACK.includes(pa)
    const bFallback = !!pb && FALLBACK.includes(pb)

    let drop: SectionKey | null = null
    let keep: SectionKey | null = null
    if (aAuthoritative && bFallback) { drop = b; keep = a }
    else if (bAuthoritative && aFallback) { drop = a; keep = b }

    if (!drop || !keep) {
      // Ambiguous provenance: preserve both and let a human decide.
      review.push(finding)
      continue
    }

    const next = removeClause(sections[drop], finding.clause)
    if (next === sections[drop]) {
      review.push(finding)
      continue
    }
    sections[drop] = next
    removed.push({ section: drop, keptIn: keep, clause: finding.clause })
  }

  return { sections, removed, review }
}

/** Drop one clause from a section, leaving the rest verbatim. */
function removeClause(text: string, clause: string): string {
  const target = foldClause(clause)
  const kept = splitSentences(text ?? '')
    .filter((s) => foldClause(s.text) !== target)
    .map((s) => s.text)
  return kept.join(' ').replace(/\s+/g, ' ').trim()
}
