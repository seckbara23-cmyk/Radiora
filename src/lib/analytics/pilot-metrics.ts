// Phase 6A.5 — Pure pilot-metric helpers. Deterministic & dependency-free so they
// can be unit-tested without Supabase. All aggregation/derivation logic lives
// here; the data layer only fetches rows and feeds them in.

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  type ConfidenceDistribution,
  type FeedbackCategory,
  type FeedbackCounts,
  type FeedbackPriority,
} from '@/types/pilot'

// ── Confidence distribution ───────────────────────────────────────────────────
// Counts AI confidence levels across all structured sections.
export function confidenceDistribution(levels: Array<string | null | undefined>): ConfidenceDistribution {
  let high = 0, medium = 0, low = 0
  for (const lvl of levels) {
    if (lvl === 'high') high++
    else if (lvl === 'medium') medium++
    else if (lvl === 'low') low++
  }
  return { high, medium, low, total: high + medium + low }
}

// ── Average corrections per report ────────────────────────────────────────────
// Mean number of self-correction events across transcriptions (one decimal).
export function averageCorrections(correctionCounts: number[]): number {
  if (correctionCounts.length === 0) return 0
  const sum = correctionCounts.reduce((a, b) => a + b, 0)
  return Math.round((sum / correctionCounts.length) * 10) / 10
}

// ── Completion rate ───────────────────────────────────────────────────────────
export function completionRate(finalized: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((finalized / total) * 100)
}

// ── Dictation method ──────────────────────────────────────────────────────────
export function topDictationMethod(mobile: number, upload: number): 'mobile' | 'upload' | 'none' {
  if (mobile === 0 && upload === 0) return 'none'
  return mobile >= upload ? 'mobile' : 'upload'
}

// ── Feedback counts ───────────────────────────────────────────────────────────
export function feedbackCounts(
  rows: Array<{ category: FeedbackCategory; priority: FeedbackPriority }>,
): FeedbackCounts {
  const byCategory = Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c, 0])) as Record<FeedbackCategory, number>
  const byPriority = Object.fromEntries(FEEDBACK_PRIORITIES.map((p) => [p, 0])) as Record<FeedbackPriority, number>
  for (const r of rows) {
    if (r.category in byCategory) byCategory[r.category]++
    if (r.priority in byPriority) byPriority[r.priority]++
  }
  return { byCategory, byPriority, total: rows.length }
}

// ── Common issues ─────────────────────────────────────────────────────────────
// Categories with at least one feedback item, busiest first.
export function commonIssues(byCategory: Record<FeedbackCategory, number>): Array<{ category: FeedbackCategory; count: number }> {
  return (Object.entries(byCategory) as Array<[FeedbackCategory, number]>)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

// ── Recommendations (rule-based, returns stable codes the UI translates) ───────
export const PILOT_THRESHOLDS = {
  lowConfidencePct: 30,   // share of low-confidence sections
  highCorrections: 5,     // average self-corrections per report
  slowValidationMin: 30,  // average draft → finalize minutes
  lowCompletionPct: 70,   // completion rate
}

export interface RecommendationInput {
  criticalFeedback: number
  confidence: ConfidenceDistribution
  avgCorrections: number
  avgValidationMinutes: number
  completionRatePct: number
}

export function pilotRecommendations(input: RecommendationInput): string[] {
  const codes: string[] = []

  if (input.criticalFeedback > 0) codes.push('critical_feedback')

  const lowPct = input.confidence.total > 0
    ? (input.confidence.low / input.confidence.total) * 100
    : 0
  if (lowPct >= PILOT_THRESHOLDS.lowConfidencePct) codes.push('low_confidence')

  if (input.avgCorrections >= PILOT_THRESHOLDS.highCorrections) codes.push('high_corrections')

  if (input.avgValidationMinutes >= PILOT_THRESHOLDS.slowValidationMin) codes.push('slow_validation')

  if (input.completionRatePct > 0 && input.completionRatePct < PILOT_THRESHOLDS.lowCompletionPct) {
    codes.push('low_completion')
  }

  if (codes.length === 0) codes.push('healthy')
  return codes
}
