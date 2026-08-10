// Feature 7 — AI structuring engine types.
//
// The "AI" here is a DETERMINISTIC, local, rule-based pipeline — no external
// model, no network, no PHI leaving the tenant. That is what lets us guarantee
// (not merely hope) that the engine never invents findings: every word in the
// structured output is traceable to a word the radiologist actually dictated.

import type { StructuredReportData } from '@/types/report'

export type Confidence = 'high' | 'medium' | 'low'

export type StructuredSectionKey =
  | 'indication'
  | 'technique'
  | 'results'
  | 'conclusion'
  | 'recommendations'

/** A detected dictated self-correction ("non… plutôt…"). */
export interface CorrectionEvent {
  marker:  string   // the trigger word/phrase (non, je corrige, plutôt, …)
  removed: string   // the superseded text the doctor retracted
  kept:    string   // the replacement the doctor settled on
  index:   number   // character offset in the source transcript
  /** R0.3 — false when the correction could NOT be safely localized: the text
   *  was left verbatim and this event is a review suggestion, not an applied
   *  edit. Absent/undefined means applied (backward compat with stored rows). */
  applied?: boolean
}

/** A token removed by the French cleanup pass, kept for transparency. */
export interface RemovedToken {
  text:   string
  reason: 'filler' | 'repetition'
  index:  number
}

export interface SectionConfidence {
  section:        StructuredSectionKey
  confidence:     Confidence
  reviewRequired: boolean
  /** True when the engine filled this from a template (e.g. a standard
   *  acquisition protocol) rather than from dictated content. Always flagged. */
  autoFilled?:    boolean
  /** R2.6 — WHY this section holds what it holds. Set by the section router;
   *  `SectionProvenance` lives in @/lib/ai/section-router. Kept as a field on
   *  the existing type rather than a parallel enum so every consumer of
   *  structuring metadata sees it for free. */
  provenance?:    string
  reason?:        string
}

export interface StructuringResult {
  rawTranscript:     string              // layer 2 — literal input
  cleanedTranscript: string              // layer 3 — after self-correction + cleanup
  correctionEvents:  CorrectionEvent[]
  removedTokens:     RemovedToken[]
  structured:        StructuredReportData // layer 4 — HPD JSON
  confidence:        SectionConfidence[]
  /** R2.6 — why each populated section holds what it holds. */
  provenance?:       Partial<Record<StructuredSectionKey, string>>
  /** R2.6 — where in the transcript each section came from, so a review flag
   *  can point at the sentence responsible. */
  sectionRanges?:    Partial<Record<StructuredSectionKey, Array<{ start: number; end: number }>>>
  /** R2.6 — clinical statements found in more than one section (exact/near
   *  only; shared vocabulary is not duplication). */
  duplication?:      Array<{ kind: string; sections: [StructuredSectionKey, StructuredSectionKey]; clause: string }>
  reviewRequired:    boolean             // any section flagged for review
}
