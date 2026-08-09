import { describe, it, expect } from 'vitest'
import { evaluateReportWrite, isReportContentLocked } from '@/lib/safety/immutability'
import type { UserRole } from '@/types/user'

// R0.2 — a finalized (signed) report is a legal medical document. Its clinical
// content may only change through the explicit amendment workflow, and only a
// radiologist carries signing / structured-acceptance authority.
//
// These cover the pure decision layer. The DB-level counterpart
// (enforce_report_immutability, migration 039) is proven by
// supabase/verify/R0_2_report_immutability.sql, which runs the same attacks
// through direct PostgREST-style table updates.

const ALL_ROLES: UserRole[] = [
  'super_admin', 'clinic_admin', 'radiologist', 'technician', 'secretary', 'viewer', 'referring_physician',
]

describe('isReportContentLocked', () => {
  it('locks finalized reports only', () => {
    expect(isReportContentLocked('finalized')).toBe(true)
    expect(isReportContentLocked('draft')).toBe(false)
    expect(isReportContentLocked('amended')).toBe(false)
    expect(isReportContentLocked(null)).toBe(false)
  })
})

describe('acceptStructuredReport authority + immutability', () => {
  it('rejects a finalized report (audit C2 — the signed document must not be rewritten)', () => {
    const check = evaluateReportWrite({
      kind: 'structuring_accept', currentStatus: 'finalized', actorRole: 'radiologist',
    })
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('Amend Report')
  })

  it('allows a radiologist on a draft', () => {
    expect(evaluateReportWrite({
      kind: 'structuring_accept', currentStatus: 'draft', actorRole: 'radiologist',
    }).allowed).toBe(true)
  })

  it('is radiologist-only — no other role may apply structured clinical content', () => {
    for (const role of ALL_ROLES.filter((r) => r !== 'radiologist')) {
      const check = evaluateReportWrite({
        kind: 'structuring_accept', currentStatus: 'draft', actorRole: role,
      })
      expect(check.allowed, `${role} must not apply structured content`).toBe(false)
    }
  })
})

describe('acceptHPDDraft immutability', () => {
  it('rejects a finalized report', () => {
    const check = evaluateReportWrite({
      kind: 'ai_accept', currentStatus: 'finalized', actorRole: 'radiologist',
    })
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('Finalized reports cannot be modified')
  })

  it('allows draft and amended (re-opened) reports', () => {
    expect(evaluateReportWrite({ kind: 'ai_accept', currentStatus: 'draft',   actorRole: 'radiologist' }).allowed).toBe(true)
    expect(evaluateReportWrite({ kind: 'ai_accept', currentStatus: 'amended', actorRole: 'clinic_admin' }).allowed).toBe(true)
  })

  it('refuses roles without clinical edit rights', () => {
    for (const role of ['secretary', 'technician', 'viewer', 'referring_physician'] as UserRole[]) {
      expect(evaluateReportWrite({ kind: 'ai_accept', currentStatus: 'draft', actorRole: role }).allowed).toBe(false)
    }
  })
})

describe('saveDraftReport immutability', () => {
  it('rejects direct edits to a finalized report and points at the amendment flow', () => {
    const check = evaluateReportWrite({
      kind: 'draft_save', currentStatus: 'finalized', actorRole: 'radiologist',
    })
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('Amend Report')
  })

  it('valid draft editing continues to work for clinical editors', () => {
    for (const role of ['radiologist', 'clinic_admin', 'super_admin'] as UserRole[]) {
      expect(evaluateReportWrite({ kind: 'draft_save', currentStatus: 'draft', actorRole: role }).allowed).toBe(true)
    }
  })
})

describe('finalizeReport authority', () => {
  it('is radiologist-only — clinic_admin and super_admin cannot sign', () => {
    expect(evaluateReportWrite({ kind: 'finalize', currentStatus: 'draft', actorRole: 'radiologist'  }).allowed).toBe(true)
    expect(evaluateReportWrite({ kind: 'finalize', currentStatus: 'draft', actorRole: 'clinic_admin' }).allowed).toBe(false)
    expect(evaluateReportWrite({ kind: 'finalize', currentStatus: 'draft', actorRole: 'super_admin'  }).allowed).toBe(false)
  })

  it('refuses to re-finalize an already finalized report', () => {
    const check = evaluateReportWrite({
      kind: 'finalize', currentStatus: 'finalized', actorRole: 'radiologist',
    })
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('already finalized')
  })
})

describe('amendReport flow', () => {
  it('the legitimate radiologist amendment flow continues to work', () => {
    expect(evaluateReportWrite({ kind: 'amend', currentStatus: 'finalized', actorRole: 'radiologist' }).allowed).toBe(true)
  })

  it('only a finalized report can be amended', () => {
    const check = evaluateReportWrite({ kind: 'amend', currentStatus: 'draft', actorRole: 'radiologist' })
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('Only a finalized report')
  })

  it('refuses roles without clinical edit rights', () => {
    expect(evaluateReportWrite({ kind: 'amend', currentStatus: 'finalized', actorRole: 'secretary' }).allowed).toBe(false)
  })
})
