// Feature 10 — the signing gate.
//
// A single, pure decision function used BOTH by the server action (to block an
// unsafe signature) and by the UI (to show the radiologist exactly what is
// outstanding). A report may be validated/signed only when:
//   1. every required section is non-empty,
//   2. no required section assesses to LOW confidence on its final content,
//   3. no unresolved AI review_required flag remains on a required section.

import type { SectionConfidence } from '@/types/structuring'
import { assessConfidence } from '@/lib/safety/confidence'
import {
  getReportSections,
  requiredSectionKeys,
  SECTION_LABELS,
  type ReportContentInput,
  type SectionKey,
} from '@/lib/safety/sections'

export type BlockerType = 'empty_section' | 'low_confidence' | 'review_required'

export interface SigningBlocker {
  type:    BlockerType
  section: SectionKey
  label:   string   // French section label, for messages
}

export interface SigningReadiness {
  canSign:  boolean
  blockers: SigningBlocker[]
}

export interface SigningGateInput extends ReportContentInput {
  /** Per-section flags from the latest structuring run, if any. */
  aiConfidence?: SectionConfidence[] | null
}

/**
 * Evaluate whether a report is safe to validate/sign.
 * Deterministic and side-effect-free. Confidence is assessed against the
 * report's CURRENT content, so editing a thin section to substance clears its
 * low-confidence / review flag without any separate "resolve" step.
 */
export function evaluateSigningReadiness(input: SigningGateInput): SigningReadiness {
  const sections = getReportSections(input)
  const required = requiredSectionKeys(input)
  const blockers: SigningBlocker[] = []

  // Map the stored AI review flags by section for quick lookup.
  const aiReview = new Map<string, boolean>()
  for (const c of input.aiConfidence ?? []) {
    if (c.reviewRequired) aiReview.set(c.section, true)
  }

  for (const key of required) {
    const text = sections[key]
    const label = SECTION_LABELS[key]

    if (!text) {
      blockers.push({ type: 'empty_section', section: key, label })
      continue // an empty section is already the strongest blocker for that key
    }

    const level = assessConfidence(text)
    if (level === 'low') {
      blockers.push({ type: 'low_confidence', section: key, label })
      continue
    }

    // An AI review flag is "unresolved" only while the section is still thin.
    // Once the radiologist has written adequate content (medium/high), it clears.
    if (aiReview.get(key) && level !== 'high') {
      blockers.push({ type: 'review_required', section: key, label })
    }
  }

  return { canSign: blockers.length === 0, blockers }
}

/** A compact, human-readable reason string for a blocked signature. */
export function describeBlockers(blockers: SigningBlocker[]): string {
  if (blockers.length === 0) return ''
  const parts = blockers.map((b) => {
    switch (b.type) {
      case 'empty_section':   return `${b.label} manquante`
      case 'low_confidence':  return `${b.label} insuffisante (confiance faible)`
      case 'review_required': return `${b.label} à revérifier`
    }
  })
  return `Signature impossible : ${parts.join(' · ')}.`
}
