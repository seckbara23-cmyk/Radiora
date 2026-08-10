// R2.6 — sentence-level section routing with provenance.
//
// THE BUG THIS EXISTS TO KILL
// The old parser routed by splitting the transcript on header keywords, then
// ran a fallback:
//
//     if (!foundSections || (!sections.results && !sections.conclusion)) {
//       …
//       if (!sections.results) sections.results = text        // ← the whole text
//     }
//
// The `||` meant the fallback fired even when a header HAD been found. Dictate
// "Indication traumatisme crânien." and you got INDICATION = the sentence and
// RÉSULTATS = the entire transcript, header included — the same clinical
// statement in two sections. A second defect compounded it: an explicit header
// captured everything to the end of the transcript, because nothing looked for
// a boundary between sentences.
//
// THE RULE NOW
// Every sentence is routed to AT MOST ONE section. There is no pass that copies
// text into a section to keep it non-empty.
//
//     Empty section > incorrect duplicated clinical content.
//
// Routing precedence, highest first:
//   1. EXPLICIT HEADER   — the doctor named the section ("Résultats :").
//   2. STRONG CUE        — an unambiguous marker ("Au total", "Conduite à tenir").
//   3. WEAK CUE          — topical clinical language, only when no explicit
//                          section is currently open.
//   4. CONTINUATION      — stays with the section already open.
//   5. INFERRED          — no signal at all and nothing open: findings.
//
// An explicit header holds until another explicit header or a STRONG cue. That
// is what stops "Indication : suspicion de nodule de 12 mm" from being dragged
// into RÉSULTATS by the word "nodule" — inside an explicit indication, topical
// vocabulary is not evidence of a section change.
//
// CONCLUSION IS NEVER GUESSED. The old parser assigned the last ~30% of
// sentences to CONCLUSION positionally, which is why R2.5 measured it being
// wholly replaced on every revision. A conclusion now requires an explicit
// header or a strong marker; otherwise it stays empty for the doctor to write.
//
// Pure — no IO, no clock, no network.

import {
  splitSentences,
  fold,
  accentInsensitivePattern,
  type Sentence,
} from '@/lib/ai/sentences'

export type RoutableSection =
  | 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'

/**
 * Why a section holds the text it holds. Threaded into `SectionConfidence`
 * rather than duplicated as a parallel enum.
 */
export type SectionProvenance =
  /** The doctor dictated the section name. */
  | 'explicit_header'
  /** Classified from clinical language (strong or weak cue). */
  | 'semantic'
  /** Continues the section that was already open. */
  | 'continuation'
  /** No signal; routed to the default destination. */
  | 'inferred'
  /** Generated from exam metadata — the protocol template. */
  | 'auto_filled'
  /** Written by the radiologist. Set by the coordinator, never by the router. */
  | 'physician_edit'

/** Ranked so a section's provenance is the strongest of its sentences. */
const PROVENANCE_RANK: Record<SectionProvenance, number> = {
  physician_edit: 5,
  explicit_header: 4,
  semantic: 3,
  continuation: 2,
  inferred: 1,
  auto_filled: 0,
}

export interface RoutedSentence extends Sentence {
  /** Text with any section header stripped. */
  body: string
  section: RoutableSection
  provenance: SectionProvenance
}

export interface RoutedSection {
  text: string
  provenance: SectionProvenance
  /** Character ranges in the source transcript this section came from. */
  ranges: Array<{ start: number; end: number }>
}

export interface RoutedTranscript {
  sentences: RoutedSentence[]
  sections: Partial<Record<RoutableSection, RoutedSection>>
}

// ─── Explicit headers ─────────────────────────────────────────────────────────

/**
 * Header aliases. The COLON form ("Impression : …") is accepted for every
 * alias. The BARE form ("Indication traumatisme crânien.") is accepted only for
 * the primary names — a sentence merely starting with "Description" or
 * "History" is not reliable enough evidence to reroute clinical text.
 */
const HEADERS: Array<{ section: RoutableSection; alias: string; bare: boolean }> = [
  { section: 'indication', alias: 'renseignements cliniques', bare: false },
  { section: 'indication', alias: 'renseignement clinique',   bare: false },
  { section: 'indication', alias: 'contexte clinique',        bare: false },
  { section: 'indication', alias: "motif d'examen",           bare: false },
  { section: 'indication', alias: 'indication clinique',      bare: true  },
  { section: 'indication', alias: 'indication',               bare: true  },
  { section: 'indication', alias: 'motif',                    bare: false },
  { section: 'indication', alias: 'clinical indication',      bare: false },
  { section: 'indication', alias: 'clinical history',         bare: false },
  { section: 'indication', alias: 'history',                  bare: false },

  { section: 'technique',  alias: "protocole d'acquisition",  bare: false },
  { section: 'technique',  alias: "technique d'acquisition",  bare: true  },
  { section: 'technique',  alias: 'protocole',                bare: false },
  { section: 'technique',  alias: 'technique',                bare: true  },
  { section: 'technique',  alias: 'procédure',                bare: false },
  { section: 'technique',  alias: 'procedure',                bare: false },
  { section: 'technique',  alias: 'method',                   bare: false },

  { section: 'results',    alias: "résultats de l'examen",    bare: true  },
  { section: 'results',    alias: 'aspect radiologique',      bare: false },
  { section: 'results',    alias: 'aspects radiologiques',    bare: false },
  { section: 'results',    alias: 'résultats',                bare: true  },
  { section: 'results',    alias: 'resultats',                bare: true  },
  { section: 'results',    alias: 'description',              bare: false },
  { section: 'results',    alias: 'observations',             bare: false },
  { section: 'results',    alias: 'findings',                 bare: false },
  { section: 'results',    alias: 'results',                  bare: false },

  { section: 'conclusion', alias: 'en conclusion',            bare: true  },
  { section: 'conclusion', alias: 'au total',                 bare: true  },
  { section: 'conclusion', alias: 'en résumé',                bare: true  },
  { section: 'conclusion', alias: 'conclusion',               bare: true  },
  { section: 'conclusion', alias: 'synthèse',                 bare: false },
  { section: 'conclusion', alias: 'synthese',                 bare: false },
  { section: 'conclusion', alias: 'impression',               bare: false },
  { section: 'conclusion', alias: 'assessment',               bare: false },
  { section: 'conclusion', alias: 'interpretation',           bare: false },

  { section: 'recommendations', alias: 'conduite à tenir',    bare: true  },
  { section: 'recommendations', alias: 'préconisations',      bare: false },
  { section: 'recommendations', alias: 'préconisation',       bare: false },
  { section: 'recommendations', alias: 'recommandations',     bare: true  },
  { section: 'recommendations', alias: 'recommandation',      bare: true  },
  { section: 'recommendations', alias: 'recommendations',     bare: false },
  { section: 'recommendations', alias: 'recommendation',      bare: false },
  { section: 'recommendations', alias: 'follow-up',           bare: false },
  { section: 'recommendations', alias: 'follow up',           bare: false },
]

// Longest alias first, so "indication clinique" wins over "indication".
const SORTED_HEADERS = [...HEADERS].sort((a, b) => b.alias.length - a.alias.length)

interface HeaderMatch {
  section: RoutableSection
  /** The sentence with the header (and its separator) removed. */
  body: string
}

/**
 * Compiled once. Each pattern is matched against the ORIGINAL sentence, so the
 * body is sliced from the doctor's real text and keeps its accents verbatim.
 *
 * The separator is required: a colon/dash/comma for every alias, or plain
 * whitespace for the primary names. Requiring it is also what stops "Indications
 * multiples" matching "indication" — the next character is `s`, not a separator.
 */
const COMPILED = SORTED_HEADERS.map((h) => ({
  section: h.section,
  re: new RegExp(
    `^(?:${accentInsensitivePattern(fold(h.alias))})${h.bare ? '(?:\\s*[:\\-–—,]\\s*|\\s+)' : '\\s*[:\\-–—,]\\s*'}`,
    'i',
  ),
}))

/** Does this sentence open with a section header? */
export function matchHeader(sentence: string): HeaderMatch | null {
  for (const h of COMPILED) {
    const m = sentence.match(h.re)
    if (!m) continue
    const body = sentence.slice(m[0].length).trim()
    // A bare header with nothing after it routes no clinical text.
    if (!body) return null
    return { section: h.section, body }
  }
  return null
}

// ─── Cues ─────────────────────────────────────────────────────────────────────

/**
 * STRONG cues re-route even out of an explicit section: they are section
 * markers in their own right, just without the colon.
 */
const STRONG_CUES: Array<{ section: RoutableSection; re: RegExp }> = [
  // Anchored: "au total" only marks a conclusion when it OPENS the clause.
  // Mid-sentence it is ordinary French — "il existe au total deux lésions"
  // is a finding, not a conclusion.
  { section: 'conclusion',      re: /^(?:au total|en conclusion|en resume|pour conclure|en synthese)\b/ },
  { section: 'recommendations', re: /\b(?:conduite a tenir|il est recommande|nous recommandons|a controler dans|controle a |surveillance a |a recontroler)\b/ },
  { section: 'technique',       re: /\b(?:acquisition (?:volumique|helicoidale|multibarrette)|sequences? (?:t1|t2|flair|de diffusion)|apres injection de produit de contraste|realise selon le protocole|incidences? de face)\b/ },
  { section: 'indication',      re: /\b(?:adresse[e]? pour|adressee pour|dans le cadre d'un bilan|examen demande pour)\b/ },
]

/**
 * WEAK cues are topical clinical language. They may only move the report
 * FORWARD (see `ORDER` below), never back.
 */
const WEAK_CUES: Array<{ section: RoutableSection; re: RegExp }> = [
  { section: 'technique',  re: /\b(?:sans injection|apres injection|coupes? (?:axiales?|fines?|millimetriques?)|reconstructions? multiplanaires?|sonde (?:haute frequence|lineaire)|doppler couleur|mode b)\b/ },
  { section: 'indication', re: /\b(?:suspicion de|bilan (?:de|d')|controle (?:de|d')|antecedents? de|pour exploration)\b/ },
  // Findings language: what was SEEN, as opposed to why or how.
  { section: 'results',    re: /\b(?:pas d|absence d|presence d|on note|on retrouve|il existe|il n'existe pas)/ },
  { section: 'results',    re: /\b(?:lesion|nodule|masse|opacite|hyperdensite|hypodensite|epanchement|fracture|kyste|adenopathie|calcification|stenose|hernie|infiltrat|condensation|contusion|hematome|anevrisme|tumeur)/ },
  { section: 'results',    re: /\b(?:de taille normale|de contours reguliers|homogene|heterogene|sans particularite|sans anomalie|d'aspect normal|bien limite)/ },
  { section: 'conclusion', re: /\b(?:aspect (?:compatible|evocateur|typique) (?:avec|de|d')|en faveur d)/ },
]

/**
 * The order a radiology report is dictated in. Weak evidence may ADVANCE the
 * report along it but never rewind: "Indication : céphalées. Petite hyperdensité
 * frontale droite." moves on to RÉSULTATS, while "Résultats : masse pulmonaire.
 * Suspicion de malignité." stays in RÉSULTATS — "suspicion de" is indication
 * vocabulary, but the doctor is plainly still describing what they saw.
 *
 * Moving backwards requires an explicit header or a strong marker.
 */
const ORDER: RoutableSection[] = [
  'indication', 'technique', 'results', 'conclusion', 'recommendations',
]
const rank = (s: RoutableSection) => ORDER.indexOf(s)

function cueFor(foldedSentence: string, cues: typeof STRONG_CUES): RoutableSection | null {
  for (const c of cues) if (c.re.test(foldedSentence)) return c.section
  return null
}

// ─── Routing ──────────────────────────────────────────────────────────────────

/**
 * Route a transcript into sections. Every sentence lands in exactly one
 * section; no sentence is ever copied into a second one.
 */
export function routeTranscript(text: string): RoutedTranscript {
  const sentences = splitSentences(text)
  const routed: RoutedSentence[] = []

  let active: RoutableSection | null = null

  for (const s of sentences) {
    const header = matchHeader(s.text)
    if (header) {
      active = header.section
      routed.push({ ...s, body: header.body, section: header.section, provenance: 'explicit_header' })
      continue
    }

    const folded = fold(s.text)

    // A strong marker is a section header without the punctuation; it may move
    // the report in any direction.
    const strong = cueFor(folded, STRONG_CUES)
    if (strong) {
      active = strong
      routed.push({ ...s, body: s.text, section: strong, provenance: 'semantic' })
      continue
    }

    // Weak evidence advances the report but never rewinds it.
    const weak = cueFor(folded, WEAK_CUES)
    if (weak && (active === null || rank(weak) > rank(active))) {
      active = weak
      routed.push({ ...s, body: s.text, section: weak, provenance: 'semantic' })
      continue
    }

    if (active) {
      routed.push({ ...s, body: s.text, section: active, provenance: 'continuation' })
      continue
    }

    // Nothing open, nothing recognised: ordinary dictation is findings. This is
    // a DEFAULT, not a catch-all — the sentence goes here INSTEAD of anywhere
    // else, never in addition to it.
    active = 'results'
    routed.push({ ...s, body: s.text, section: 'results', provenance: 'inferred' })
  }

  const sections: Partial<Record<RoutableSection, RoutedSection>> = {}
  for (const r of routed) {
    const existing = sections[r.section]
    if (!existing) {
      sections[r.section] = {
        text: r.body,
        provenance: r.provenance,
        ranges: [{ start: r.start, end: r.end }],
      }
      continue
    }
    existing.text = `${existing.text} ${r.body}`.replace(/\s+/g, ' ').trim()
    existing.ranges.push({ start: r.start, end: r.end })
    if (PROVENANCE_RANK[r.provenance] > PROVENANCE_RANK[existing.provenance]) {
      existing.provenance = r.provenance
    }
  }

  return { sentences: routed, sections }
}
