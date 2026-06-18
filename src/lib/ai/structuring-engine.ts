// Feature 7 — structuring engine (orchestrator).
//
// Pipeline:  raw transcript
//   → self-correction  (drop dictated retractions)
//   → French cleanup   (fillers, repetitions, terminology)
//   → HPD structuring  (split into INDICATION / TECHNIQUE / RÉSULTATS /
//                       CONCLUSION / RECOMMANDATIONS via parseStructuredText)
//   → confidence scoring + review flags
//
// SAFETY INVARIANT: the engine never invents clinical content. Every word in
// RÉSULTATS / CONCLUSION / INDICATION / RECOMMANDATIONS is sliced from the
// doctor's own (cleaned) words. The ONLY generated text is the TECHNIQUE
// acquisition protocol template, which is always flagged autoFilled + review.

import { parseStructuredText, buildDefaultTechnique } from '@/lib/ai/hpd-engine'
import { detectSelfCorrections } from '@/lib/ai/self-correction'
import { cleanupFrench } from '@/lib/ai/french-cleanup'
import type {
  Confidence,
  SectionConfidence,
  StructuredSectionKey,
  StructuringResult,
} from '@/types/structuring'

export interface StructuringInput {
  rawTranscript: string
  modality:      string | null
  bodyPart:      string | null
  patientName:   string
  patientAge:    string
  patientSex:    string
  locale?:       string
}

// Minimal header detection (mirrors hpd-engine's SECTION_KEYWORDS) so we can tell
// whether a section was explicitly dictated as a header vs. inferred by split.
const HEADER_HINTS: Record<StructuredSectionKey, RegExp> = {
  indication:      /\b(indication|renseignements?\s+clinique|contexte\s+clinique|motif)\b/i,
  technique:       /\b(technique|protocole|proc[ée]dure)\b/i,
  results:         /\b(r[ée]sultats?|aspect\s+radiologique|description|observations?|findings)\b/i,
  conclusion:      /\b(conclusion|au\s+total|en\s+r[ée]sum[ée]|synth[èe]se|impression)\b/i,
  recommendations: /\b(recommandations?|conduite\s+[àa]\s+tenir|pr[ée]conisations?|follow)\b/i,
}

function scoreSection(
  section:      StructuredSectionKey,
  value:        string,
  cleanedText:  string,
  autoFilled:   boolean,
): SectionConfidence {
  const text = (value ?? '').trim()
  const hasHeader = HEADER_HINTS[section].test(cleanedText)

  // Optional section: absent recommendations is normal, not a problem.
  if (section === 'recommendations' && !text) {
    return { section, confidence: 'low', reviewRequired: false, reason: 'not dictated' }
  }

  // Auto-filled technique template — always confirm.
  if (section === 'technique' && autoFilled) {
    return {
      section,
      confidence:     'medium',
      reviewRequired: true,
      autoFilled:     true,
      reason:         'standard protocol template — confirm it matches the acquisition',
    }
  }

  if (!text) {
    // Empty findings/conclusion/indication: missing stays blank, but flag it.
    const critical = section === 'results' || section === 'conclusion'
    return {
      section,
      confidence:     'low',
      reviewRequired: critical,
      reason:         'no content detected — left blank (the engine never invents)',
    }
  }

  let confidence: Confidence
  if (hasHeader && text.length >= 12) confidence = 'high'
  else if (text.length >= 40)         confidence = 'high'
  else if (text.length >= 15)         confidence = 'medium'
  else                                confidence = 'low'

  return {
    section,
    confidence,
    reviewRequired: confidence === 'low',
    reason:         hasHeader ? 'explicit section detected' : 'inferred from dictation',
  }
}

export function runStructuring(input: StructuringInput): StructuringResult {
  const raw = (input.rawTranscript ?? '').trim()

  // 1. Resolve dictated self-corrections.
  const { corrected, events } = detectSelfCorrections(raw)

  // 2. Clean fillers / repetitions / terminology.
  const { cleaned, removed } = cleanupFrench(corrected)

  // 3. Structure into HPD sections (no invention — pure slicing + protocol template).
  const structured = parseStructuredText(cleaned, {
    modality:    input.modality,
    bodyPart:    input.bodyPart,
    patientName: input.patientName,
    patientAge:  input.patientAge,
    patientSex:  input.patientSex,
    locale:      input.locale ?? 'fr',
  })

  // Detect whether the TECHNIQUE came from the template (auto-filled) vs dictation.
  const template = input.modality ? buildDefaultTechnique(input.modality) : ''
  const techniqueAutoFilled =
    !HEADER_HINTS.technique.test(cleaned) &&
    !!structured.technique &&
    structured.technique === template

  const confidence: SectionConfidence[] = [
    scoreSection('indication',      structured.indication,            cleaned, false),
    scoreSection('technique',       structured.technique,             cleaned, techniqueAutoFilled),
    scoreSection('results',         structured.results,               cleaned, false),
    scoreSection('conclusion',      structured.conclusion,            cleaned, false),
    scoreSection('recommendations', structured.recommendations ?? '', cleaned, false),
  ]

  return {
    rawTranscript:     raw,
    cleanedTranscript: cleaned,
    correctionEvents:  events,
    removedTokens:     removed,
    structured,
    confidence,
    reviewRequired:    confidence.some((c) => c.reviewRequired),
  }
}
