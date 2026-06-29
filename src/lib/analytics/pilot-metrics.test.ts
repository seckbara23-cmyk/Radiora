import { describe, it, expect } from 'vitest'
import {
  confidenceDistribution,
  averageCorrections,
  completionRate,
  topDictationMethod,
  feedbackCounts,
  commonIssues,
  pilotRecommendations,
} from '@/lib/analytics/pilot-metrics'

describe('confidenceDistribution', () => {
  it('tallies levels and ignores unknowns', () => {
    const d = confidenceDistribution(['high', 'high', 'medium', 'low', null, 'bogus', undefined])
    expect(d).toEqual({ high: 2, medium: 1, low: 1, total: 4 })
  })
  it('is empty for no input', () => {
    expect(confidenceDistribution([])).toEqual({ high: 0, medium: 0, low: 0, total: 0 })
  })
})

describe('averageCorrections', () => {
  it('averages to one decimal', () => {
    expect(averageCorrections([0, 1, 2])).toBe(1)
    expect(averageCorrections([1, 2])).toBe(1.5)
    expect(averageCorrections([1, 1, 2])).toBe(1.3)
  })
  it('is 0 for no data', () => {
    expect(averageCorrections([])).toBe(0)
  })
})

describe('completionRate', () => {
  it('computes a percentage', () => {
    expect(completionRate(7, 10)).toBe(70)
    expect(completionRate(0, 0)).toBe(0)
    expect(completionRate(3, 0)).toBe(0)
  })
})

describe('topDictationMethod', () => {
  it('picks the busier method, mobile wins ties', () => {
    expect(topDictationMethod(5, 3)).toBe('mobile')
    expect(topDictationMethod(2, 9)).toBe('upload')
    expect(topDictationMethod(4, 4)).toBe('mobile')
    expect(topDictationMethod(0, 0)).toBe('none')
  })
})

describe('feedbackCounts / commonIssues', () => {
  const rows = [
    { category: 'ai' as const, priority: 'critical' as const },
    { category: 'ai' as const, priority: 'important' as const },
    { category: 'ui' as const, priority: 'nice_to_have' as const },
  ]
  it('counts by category and priority', () => {
    const c = feedbackCounts(rows)
    expect(c.total).toBe(3)
    expect(c.byCategory.ai).toBe(2)
    expect(c.byCategory.ui).toBe(1)
    expect(c.byCategory.workflow).toBe(0)
    expect(c.byPriority.critical).toBe(1)
    expect(c.byPriority.important).toBe(1)
    expect(c.byPriority.nice_to_have).toBe(1)
  })
  it('ranks common issues, busiest first, drops zeros', () => {
    const c = feedbackCounts(rows)
    expect(commonIssues(c.byCategory)).toEqual([
      { category: 'ai', count: 2 },
      { category: 'ui', count: 1 },
    ])
  })
})

describe('pilotRecommendations', () => {
  const healthy = {
    criticalFeedback: 0,
    confidence: { high: 8, medium: 2, low: 0, total: 10 },
    avgCorrections: 1,
    avgValidationMinutes: 10,
    completionRatePct: 90,
  }
  it('returns healthy when nothing is flagged', () => {
    expect(pilotRecommendations(healthy)).toEqual(['healthy'])
  })
  it('flags critical feedback', () => {
    expect(pilotRecommendations({ ...healthy, criticalFeedback: 2 })).toContain('critical_feedback')
  })
  it('flags low confidence when ≥30% low', () => {
    expect(pilotRecommendations({ ...healthy, confidence: { high: 5, medium: 1, low: 4, total: 10 } }))
      .toContain('low_confidence')
  })
  it('flags high corrections and slow validation', () => {
    const r = pilotRecommendations({ ...healthy, avgCorrections: 6, avgValidationMinutes: 45 })
    expect(r).toContain('high_corrections')
    expect(r).toContain('slow_validation')
  })
  it('flags low completion', () => {
    expect(pilotRecommendations({ ...healthy, completionRatePct: 50 })).toContain('low_completion')
  })
})
