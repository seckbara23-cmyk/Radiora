import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isReportContentLocked, evaluateReportWrite } from '@/lib/safety/immutability'
import { canEditClinicalContent } from '@/lib/safety/authority'
import { ownerColumns, reportOwner, vacationItemOwner } from '@/lib/dictation/owner'
import type { UserRole } from '@/types/user'

// R2.2 — the rules the report-owned dictation actions enforce.
//
// The actions themselves need Supabase, so the database-level guarantees
// (exactly-one-owner, cross-clinic rejection, report-owned lookup) are proven by
// supabase/verify/R2_2_report_linked_dictation.sql. What is asserted here is the
// pure decision logic those actions call, plus source-level guarantees that they
// use the canonical pipeline and do not fork the queue workflow.

const SRC = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const REPORT = 'a2000000-0000-4000-8000-0000000000f1'
const ITEM   = 'a2000000-0000-4000-8000-0000000000e1'

describe('who may attach dictation to a report', () => {
  it('clinical editors may', () => {
    for (const role of ['radiologist', 'clinic_admin', 'super_admin'] as UserRole[]) {
      expect(canEditClinicalContent(role), role).toBe(true)
    }
  })

  it('clerical and read-only roles may not', () => {
    for (const role of ['secretary', 'technician', 'viewer', 'referring_physician'] as UserRole[]) {
      expect(canEditClinicalContent(role), role).toBe(false)
    }
  })
})

describe('a finalized report rejects new dictation', () => {
  it('finalized content is locked', () => {
    expect(isReportContentLocked('finalized')).toBe(true)
  })

  it('draft and amended reports accept dictation', () => {
    expect(isReportContentLocked('draft')).toBe(false)
    expect(isReportContentLocked('amended')).toBe(false)
  })

  it('the same lock governs applying a structured draft', () => {
    // Dictation that could not be accepted afterwards would be a trap; the
    // acceptance gate agrees with the dictation gate.
    expect(evaluateReportWrite({
      kind: 'ai_accept', currentStatus: 'finalized', actorRole: 'radiologist',
    }).allowed).toBe(false)
    expect(evaluateReportWrite({
      kind: 'ai_accept', currentStatus: 'amended', actorRole: 'radiologist',
    }).allowed).toBe(true)
  })
})

describe('payload shape for each owner', () => {
  it('a report-owned transcript sets report_id only', () => {
    expect(ownerColumns(reportOwner(REPORT))).toEqual({
      report_id: REPORT, vacation_item_id: null,
    })
  })

  it('the queue payload is byte-identical to the pre-R2.2 shape', () => {
    expect(ownerColumns(vacationItemOwner(ITEM))).toEqual({
      report_id: null, vacation_item_id: ITEM,
    })
  })
})

describe('the report path uses the canonical pipeline', () => {
  const src = SRC('lib/actions/report-dictation.ts')

  it('structures through buildHpdDraft, not a second engine', () => {
    expect(src).toContain('buildHpdDraft')
    // No direct reach past the pipeline into the parser.
    expect(src).not.toContain('parseStructuredText')
  })

  it('never writes report clinical content — acceptance stays with the radiologist', () => {
    expect(src).not.toMatch(/from\('reports'\)[\s\S]{0,200}\.update\(/)
  })

  it('does not touch the vacation queue', () => {
    expect(src).not.toContain('vacation_items')
  })

  it('checks every Supabase error it issues', () => {
    // Every destructured `error:` alias is followed by a guard somewhere.
    const aliases = [...src.matchAll(/error:\s*(\w+Error)\b/g)].map((m) => m[1])
    expect(aliases.length).toBeGreaterThan(0)
    for (const alias of new Set(aliases)) {
      expect(src, `${alias} is never checked`).toMatch(new RegExp(`if\\s*\\(${alias}`))
    }
  })

  it('audits owner identity without logging transcript content or tokens', () => {
    expect(src).toContain('ownerAuditMetadata')

    // Inspect each audit metadata literal. A transcript variable may appear
    // only as a SIZE (`.length`) — never as a value, which would put clinical
    // content into the audit log. Tokens may not appear at all.
    const blocks = [...src.matchAll(/metadata:\s*\{[^}]*\}/g)].map((m) => m[0])
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block, block).not.toMatch(/\b(rawText|raw_text|corrected_text|cleaned_text)\b(?!\.length)/)
      expect(block, block).not.toMatch(/\btoken\b/i)
    }
  })

  it('takes the clinic from the report row, never from the caller', () => {
    expect(src).toContain('report.clinic_id')
  })
})

describe('the mobile upload resolves its owner from the session', () => {
  const src = SRC('lib/actions/dictation.ts')

  it('reads the owner off the stored session rather than trusting the phone', () => {
    expect(src).toContain('ownerFromRow(session')
    expect(src).toContain("select('id, clinic_id, vacation_item_id, report_id")
  })

  it('rejects a session whose owner cannot be resolved', () => {
    expect(src).toMatch(/if \(!owner\) return \{ error/)
  })

  it('re-checks the report is still unsigned at upload time', () => {
    expect(src).toContain('isReportContentLocked')
  })

  it('keeps the queue branch intact', () => {
    expect(src).toContain("owner.kind === 'vacation_item'")
    expect(src).toContain('audio_asset_id: assetId')
  })
})

describe('the signing-safety lookup reads both owner kinds', () => {
  const src = SRC('lib/data/safety.ts')

  it('tries the report-owned transcript first', () => {
    expect(src).toContain(".eq('report_id', reportId)")
  })

  it('still resolves the queue-owned transcript', () => {
    expect(src).toContain("from('vacation_items')")
    expect(src).toContain(".eq('vacation_item_id'")
  })

  it('returns null rather than defaulting to safe metadata', () => {
    // Missing metadata must never read as "high confidence".
    expect(src).not.toMatch(/confidence:\s*\[\s*\{\s*confidence:\s*'high'/)
    expect(src).toContain('return null')
  })
})
