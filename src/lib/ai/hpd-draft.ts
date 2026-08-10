// R2.0 — the radiologist-facing HPD draft, as a pure function.
//
// This is the clinical core of the `generateHPDDraft` server action, separated
// from its IO (auth, ai_jobs/ai_outputs rows, audit) so the behaviour that
// matters medically is unit-testable without a database.
//
// It runs the CANONICAL pipeline — the same `runStructuring` the vacation queue
// and the live preview already use:
//
//   raw transcript
//     → detectSelfCorrections   (dictated retractions, preservation-first)
//     → cleanupFrench           (fillers/terminology; uncertainty fail-safe)
//     → parseStructuredText     (HPD sections)
//     → confidence + reviewRequired
//     → analyzeClinicalSafety   (advisory warnings incl. heavy cleanup drift)
//
// Before R2.0 the action reached past this and called `parseStructuredText`
// directly, so the radiologist's own surface was the only entry point without
// self-correction, French cleanup or confidence scoring.
//
// PURE: synchronous, no IO, no network, no external model. The only external
// model in this product is none — structuring is local and deterministic, which
// is what lets the safety invariants be proven rather than hoped for.

import { runStructuring } from '@/lib/ai/structuring-engine'
import { analyzeClinicalSafety, type ClinicalWarning } from '@/lib/safety/clinical-warnings'
import type { StructuredReportData } from '@/types/report'
import type {
  CorrectionEvent,
  RemovedToken,
  SectionConfidence,
  StructuredSectionKey,
  StructuringResult,
} from '@/types/structuring'

/** Safety metadata produced alongside the structured draft. */
export interface HpdStructuringMeta {
  /** Layer 2 — the radiologist's literal words, before any transformation. */
  rawTranscript: string
  /** Layer 3 — after self-correction + French cleanup. */
  cleanedTranscript: string
  /** Dictated retractions. `applied: false` means the engine refused to act and
   *  preserved the text — a review suggestion, not an edit. */
  correctionEvents: CorrectionEvent[]
  /** Fillers / repetitions removed by the cleanup pass. */
  removedTokens: RemovedToken[]
  /** Per-section confidence, incl. `autoFilled` for the protocol template. */
  confidence: SectionConfidence[]
  /** True when any section needs human review before signing. */
  reviewRequired: boolean
  /** Advisory warnings, incl. heavy_cleanup_drift (raw vs cleaned). */
  warnings: ClinicalWarning[]
  /** R2.6 — why each populated section holds what it holds. */
  provenance: Partial<Record<StructuredSectionKey, string>>
  /** R2.6 — clinical statements found in more than one section. */
  duplication: NonNullable<StructuringResult['duplication']>
}

export interface HpdDraftInput {
  rawTranscript: string
  modality: string | null
  bodyPart: string | null
  patientName?: string
  patientAge?: string
  patientSex?: string
  locale?: string
}

export interface HpdDraft {
  output: StructuredReportData
  structuring: HpdStructuringMeta
}

/**
 * Build the structured HPD draft plus its safety metadata.
 * Synchronous by construction — an external call would force this async.
 */
export function buildHpdDraft(input: HpdDraftInput): HpdDraft {
  const result = runStructuring({
    rawTranscript: input.rawTranscript,
    modality:      input.modality,
    bodyPart:      input.bodyPart,
    patientName:   input.patientName ?? '',
    patientAge:    input.patientAge ?? '',
    patientSex:    input.patientSex ?? '',
    locale:        input.locale ?? 'fr',
  })

  // parseStructuredText runs on the CLEANED text inside runStructuring and
  // records that as dictationTranscript. Restore the radiologist's literal
  // words as the provenance record; the cleaned layer travels in the metadata.
  const output: StructuredReportData = {
    ...result.structured,
    dictationTranscript: result.rawTranscript,
  }

  const warnings = analyzeClinicalSafety({
    structuredData:    output,
    aiConfidence:      result.confidence,
    rawTranscript:     result.rawTranscript,
    cleanedTranscript: result.cleanedTranscript,
  })

  return {
    output,
    structuring: {
      rawTranscript:     result.rawTranscript,
      cleanedTranscript: result.cleanedTranscript,
      correctionEvents:  result.correctionEvents,
      removedTokens:     result.removedTokens,
      confidence:        result.confidence,
      reviewRequired:    result.reviewRequired,
      warnings,
      provenance:        result.provenance  ?? {},
      duplication:       result.duplication ?? [],
    },
  }
}
