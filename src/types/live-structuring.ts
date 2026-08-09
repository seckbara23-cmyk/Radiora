// R1 — incremental structuring contract (design freeze, not an implementation).
//
// WHY THIS EXISTS
// The deployed structuring path recomputes the WHOLE report from the WHOLE
// transcript on every tick (computeLivePreview → runStructuring). That is safe
// and deterministic, but it cannot survive a radiologist editing a section
// mid-dictation: the next recompute would silently overwrite their words.
//
// This module defines the contract that makes incremental structuring possible
// WITHOUT a second report model. It deliberately reuses the existing canonical
// types rather than restating them:
//   • SectionKey          — src/lib/safety/sections.ts (the 5 HPD sections)
//   • Confidence          — src/types/structuring.ts
//   • CorrectionEvent     — src/types/structuring.ts (incl. `applied: false`
//                           for corrections the engine refused to localize)
// and it projects back into StructuredReportData (src/types/report.ts), which
// is what already feeds buildReportExportModel → PDF / DOCX / print / delivery.
//
// PROVIDER-NEUTRAL: nothing here names a model, vendor or transport. A patch is
// whatever the structuring step produced — today the local deterministic
// engine, later possibly something else — and the safety rules below hold
// regardless of who produced it.

import type { SectionKey } from '@/lib/safety/sections'
import type { Confidence, CorrectionEvent } from '@/types/structuring'

/** Character span in the transcript a section's text was derived from. */
export interface TranscriptRange {
  start: number
  end: number
}

/**
 * Where a section's current text came from. This is provenance, not styling —
 * it decides who is allowed to overwrite the text next.
 */
export type SectionOrigin =
  /** Seeded from a clinical template or a default protocol paragraph. The ONLY
   *  origin that is machine-authored rather than dictated, so it always carries
   *  reviewRequired until a human touches it. */
  | 'template'
  /** Derived from words the radiologist actually dictated. */
  | 'dictation'
  /** Typed or edited directly by the radiologist. Authoritative. */
  | 'radiologist'

export interface SectionState {
  text: string
  origin: SectionOrigin
  /**
   * True once the radiologist has authored this section. A locked section is
   * never overwritten by a later patch — the patch is returned as a suggestion
   * instead. This is what lets structuring keep running while a doctor edits.
   */
  locked: boolean
  confidence?: Confidence
  /** Must be true whenever origin === 'template' (enforced on apply). */
  reviewRequired?: boolean
  sourceRange?: TranscriptRange
}

/**
 * The live clinical state of one report during dictation.
 *
 * `transcript` and `sections` are deliberately SEPARATE: structuring reads the
 * transcript and proposes sections, but nothing in this contract may shorten or
 * rewrite the transcript. The transcript is the provenance record; the sections
 * are the editable clinical document.
 */
export interface LiveReportState {
  transcript: string
  sections: Record<SectionKey, SectionState>
  /** Append-only provenance trail of every patch decision. */
  log: PatchLogEntry[]
}

export type PatchKind = 'dictated' | 'correction'

export interface SectionPatch {
  key: SectionKey
  text: string
  origin?: SectionOrigin
  confidence?: Confidence
  reviewRequired?: boolean
  sourceRange?: TranscriptRange
  /** 'correction' supersedes earlier dictated text for the same section. */
  kind?: PatchKind
}

/**
 * One incremental structuring result. `transcript` is the FULL transcript the
 * patch was derived from, not a delta — the engine is a pure function of the
 * whole transcript, and carrying the whole thing keeps that verifiable.
 */
export interface StructuredReportPatch {
  transcript: string
  sections: SectionPatch[]
  /** Self-corrections detected upstream, including refused ones. */
  corrections?: CorrectionEvent[]
}

export type PatchOutcome =
  /** Written into the section. */
  | 'applied'
  /** Identical text — no write, no log noise. */
  | 'unchanged'
  /** Patch was blank while the section had content: never blank a section. */
  | 'skipped_empty'
  /** Radiologist owns the section; returned as a suggestion instead. */
  | 'suggested_locked'

export interface PatchLogEntry {
  key: SectionKey
  outcome: PatchOutcome
  kind: PatchKind
  previousText: string
  nextText: string
  sourceRange?: TranscriptRange
}

export interface PatchResult {
  state: LiveReportState
  entries: PatchLogEntry[]
  /** Patches withheld because the radiologist has locked that section. The UI
   *  offers these; it never applies them silently. */
  suggestions: SectionPatch[]
  /** True when the patch tried to shorten the transcript — a session mismatch
   *  the caller must resolve rather than silently accept. */
  transcriptRegressed: boolean
}
