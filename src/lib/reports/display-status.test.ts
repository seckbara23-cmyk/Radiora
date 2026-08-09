import { describe, it, expect } from 'vitest'
import {
  reportDisplayStatus,
  internalStatusesFor,
  isReportDisplayStatus,
  displayStatusVariant,
  REPORT_DISPLAY_STATUSES,
} from '@/lib/reports/display-status'
import type { ReportStatus } from '@/types/report'

// R2.1 — the radiologist reads plain language, never internal state names.

describe('reportDisplayStatus', () => {
  it('maps every internal status to a display status', () => {
    for (const s of ['draft', 'in_review', 'finalized', 'amended'] as ReportStatus[]) {
      expect(REPORT_DISPLAY_STATUSES).toContain(reportDisplayStatus(s))
    }
  })

  it('a draft reads as Draft', () => {
    expect(reportDisplayStatus('draft')).toBe('draft')
  })

  it('in_review reads as Review required', () => {
    expect(reportDisplayStatus('in_review')).toBe('review_required')
  })

  it('finalized reads as Signed', () => {
    expect(reportDisplayStatus('finalized')).toBe('signed')
  })

  it('an amended report reads as Review required, NOT Signed', () => {
    // Amending clears signed_at at the database level, so showing "Signé"
    // would claim a signature that no longer exists.
    expect(reportDisplayStatus('amended')).toBe('review_required')
  })

  it('a delivered signed report reads as Delivered', () => {
    expect(reportDisplayStatus('finalized', { delivered: true })).toBe('delivered')
  })

  it('delivery never overrides an unsigned report', () => {
    expect(reportDisplayStatus('draft', { delivered: true })).toBe('draft')
    expect(reportDisplayStatus('amended', { delivered: true })).toBe('review_required')
  })

  it('never leaks an internal status name', () => {
    const internal = ['in_review', 'finalized', 'amended']
    for (const s of ['draft', 'in_review', 'finalized', 'amended'] as ReportStatus[]) {
      const display = reportDisplayStatus(s)
      if (s !== 'draft') expect(internal).not.toContain(display)
    }
  })
})

describe('internalStatusesFor', () => {
  it('Review required covers both in_review and amended', () => {
    expect(internalStatusesFor('review_required').sort()).toEqual(['amended', 'in_review'])
  })

  it('Signed and Delivered both query finalized', () => {
    expect(internalStatusesFor('signed')).toEqual(['finalized'])
    expect(internalStatusesFor('delivered')).toEqual(['finalized'])
  })

  it('round-trips: every internal status is reachable through some filter', () => {
    const covered = new Set(REPORT_DISPLAY_STATUSES.flatMap(internalStatusesFor))
    for (const s of ['draft', 'in_review', 'finalized', 'amended']) {
      expect(covered, s).toContain(s)
    }
  })
})

describe('guards and presentation', () => {
  it('validates URL filter values', () => {
    expect(isReportDisplayStatus('signed')).toBe(true)
    expect(isReportDisplayStatus('finalized')).toBe(false) // internal name rejected
    expect(isReportDisplayStatus('')).toBe(false)
  })

  it('every display status has a badge variant', () => {
    for (const s of REPORT_DISPLAY_STATUSES) {
      expect(displayStatusVariant[s]).toBeTruthy()
    }
  })
})
