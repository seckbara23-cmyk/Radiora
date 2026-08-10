import { describe, it, expect } from 'vitest'
import {
  reportOwner,
  vacationItemOwner,
  parseDictationOwner,
  hasExactlyOneOwner,
  ownerId,
  isReportOwned,
  ownerColumns,
  audioOwnerColumns,
  ownerFilter,
  ownerReturnPath,
  ownerAuditMetadata,
  ownerFromRow,
} from '@/lib/dictation/owner'

// R2.2 — dictation ownership. Mirrors the migration-044 constraints:
//   dictation_sessions / transcriptions : exactly one owner
//   audio_assets                        : never both (neither is legal)

const REPORT = 'e0000000-0000-4000-8000-0000000000f1'
const ITEM   = 'c0000000-0000-4000-8000-0000000000e1'

describe('exactly one owner', () => {
  it('rejects BOTH owners', () => {
    expect(parseDictationOwner({ reportId: REPORT, vacationItemId: ITEM })).toBeNull()
    expect(hasExactlyOneOwner({ reportId: REPORT, vacationItemId: ITEM })).toBe(false)
  })

  it('rejects NEITHER owner', () => {
    expect(parseDictationOwner({})).toBeNull()
    expect(parseDictationOwner({ reportId: '', vacationItemId: '' })).toBeNull()
    expect(parseDictationOwner({ reportId: null, vacationItemId: null })).toBeNull()
    expect(hasExactlyOneOwner({})).toBe(false)
  })

  it('rejects whitespace-only ids rather than treating them as present', () => {
    expect(parseDictationOwner({ reportId: '   ' })).toBeNull()
  })

  it('accepts exactly one', () => {
    expect(parseDictationOwner({ reportId: REPORT })).toEqual({ kind: 'report', reportId: REPORT })
    expect(parseDictationOwner({ vacationItemId: ITEM })).toEqual({ kind: 'vacation_item', vacationItemId: ITEM })
  })
})

describe('accessors', () => {
  it('extracts the owner id whatever the kind', () => {
    expect(ownerId(reportOwner(REPORT))).toBe(REPORT)
    expect(ownerId(vacationItemOwner(ITEM))).toBe(ITEM)
  })

  it('narrows the report case', () => {
    expect(isReportOwned(reportOwner(REPORT))).toBe(true)
    expect(isReportOwned(vacationItemOwner(ITEM))).toBe(false)
  })
})

describe('database payloads', () => {
  it('a report owner writes report_id and NULLS the queue column', () => {
    expect(ownerColumns(reportOwner(REPORT))).toEqual({ report_id: REPORT, vacation_item_id: null })
  })

  it('the vacation-item payload stays exactly as it was', () => {
    expect(ownerColumns(vacationItemOwner(ITEM))).toEqual({ report_id: null, vacation_item_id: ITEM })
  })

  it('always emits both columns so an UPDATE cannot leave a stale second owner', () => {
    for (const owner of [reportOwner(REPORT), vacationItemOwner(ITEM)]) {
      const cols = ownerColumns(owner)
      expect(Object.keys(cols).sort()).toEqual(['report_id', 'vacation_item_id'])
    }
  })

  it('every payload satisfies the exactly-one-owner constraint', () => {
    for (const owner of [reportOwner(REPORT), vacationItemOwner(ITEM)]) {
      const cols = ownerColumns(owner)
      const set = [cols.report_id, cols.vacation_item_id].filter(Boolean)
      expect(set).toHaveLength(1)
    }
  })

  it('audio uses vacation_id for the queue owner, not vacation_item_id', () => {
    expect(audioOwnerColumns(vacationItemOwner(ITEM), { vacationId: 'vac-1' }))
      .toEqual({ report_id: null, vacation_id: 'vac-1' })
    expect(audioOwnerColumns(reportOwner(REPORT)))
      .toEqual({ report_id: REPORT, vacation_id: null })
  })

  it('audio never sets both owners', () => {
    for (const cols of [
      audioOwnerColumns(reportOwner(REPORT)),
      audioOwnerColumns(vacationItemOwner(ITEM), { vacationId: 'vac-1' }),
      audioOwnerColumns(vacationItemOwner(ITEM)), // unassigned batch upload
    ]) {
      expect([cols.report_id, cols.vacation_id].filter(Boolean).length).toBeLessThanOrEqual(1)
    }
  })

  it('builds the right filter column', () => {
    expect(ownerFilter(reportOwner(REPORT))).toEqual({ column: 'report_id', value: REPORT })
    expect(ownerFilter(vacationItemOwner(ITEM))).toEqual({ column: 'vacation_item_id', value: ITEM })
  })
})

describe('navigation and audit', () => {
  it('returns the caller to the right workspace', () => {
    expect(ownerReturnPath(reportOwner(REPORT))).toBe(`/reports/${REPORT}`)
    expect(ownerReturnPath(vacationItemOwner(ITEM))).toBe(`/vacations/items/${ITEM}`)
  })

  it('audit metadata identifies the owner and nothing else', () => {
    const meta = ownerAuditMetadata(reportOwner(REPORT))
    expect(meta).toEqual({ ownerKind: 'report', ownerId: REPORT })
    // No transcript, no token, no patient data.
    expect(Object.keys(meta).sort()).toEqual(['ownerId', 'ownerKind'])
  })
})

describe('reading an owner back off a row', () => {
  it('round-trips a report-owned row', () => {
    const row = ownerColumns(reportOwner(REPORT))
    expect(ownerFromRow(row)).toEqual(reportOwner(REPORT))
  })

  it('round-trips a queue-owned row', () => {
    const row = ownerColumns(vacationItemOwner(ITEM))
    expect(ownerFromRow(row)).toEqual(vacationItemOwner(ITEM))
  })

  it('returns null for a malformed row rather than guessing', () => {
    expect(ownerFromRow({ report_id: REPORT, vacation_item_id: ITEM })).toBeNull()
    expect(ownerFromRow({})).toBeNull()
  })
})
