// Phase 6A.5 — Clinical pilot instrumentation & feedback types.

export const FEEDBACK_CATEGORIES = ['workflow', 'ai', 'ui', 'performance', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_PRIORITIES = ['critical', 'important', 'nice_to_have'] as const
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]

export interface PilotFeedback {
  id: string
  category: FeedbackCategory
  priority: FeedbackPriority
  message: string
  status: 'new' | 'reviewed' | 'closed'
  createdAt: string
  authorName: string | null
}

export interface ConfidenceDistribution {
  high: number
  medium: number
  low: number
  total: number
}

// KPI block for the pilot dashboard.
export interface PilotKpis {
  reportsCompleted: number
  avgDictationSeconds: number
  avgValidationMinutes: number
  avgCorrections: number
  confidence: ConfidenceDistribution
  exportCount: number
  secureDeliveryCount: number
}

// Workflow-step timings + usage (session analytics).
export interface PilotSessionAnalytics {
  // Average minutes per workflow step (reusing existing spans).
  dictationMinutes: number
  validationMinutes: number
  turnaroundMinutes: number
  completionRatePct: number
  dictationMethod: {
    mobile: number
    upload: number
    topMethod: 'mobile' | 'upload' | 'none'
  }
  exportUsage: {
    pdf: number
    docx: number
    print: number
  }
}

export interface FeedbackCounts {
  byCategory: Record<FeedbackCategory, number>
  byPriority: Record<FeedbackPriority, number>
  total: number
}

export interface PilotMetrics {
  dayRange: number
  generatedAt: string
  clinicName: string | null
  kpis: PilotKpis
  session: PilotSessionAnalytics
  feedback: FeedbackCounts
  recentFeedback: PilotFeedback[]
}

// Administrator pilot report (a synthesized summary).
export interface PilotReport {
  metrics: PilotMetrics
  commonIssues: Array<{ category: FeedbackCategory; count: number }>
  recommendations: string[]
}
