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
  reason?:        string
}

export interface StructuringResult {
  rawTranscript:     string              // layer 2 — literal input
  cleanedTranscript: string              // layer 3 — after self-correction + cleanup
  correctionEvents:  CorrectionEvent[]
  removedTokens:     RemovedToken[]
  structured:        StructuredReportData // layer 4 — HPD JSON
  confidence:        SectionConfidence[]
  reviewRequired:    boolean             // any section flagged for review
}
