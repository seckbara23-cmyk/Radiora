import { describe, it, expect } from 'vitest'
import { createReportVersion, type VersionDb } from '@/lib/reports/versioning'

// R0.2 — supabase-js does NOT throw on failure, it returns { error }. The old
// snapshot code wrapped inserts in try/catch and never read the error, so a
// failed snapshot looked like success — and an amendment could destroy the only
// copy of a signed report with no trace. These tests pin the new contract:
// errors are surfaced, not swallowed.

interface StubOptions {
  prev?:        { version_number: number; findings?: string; impression?: string; recommendations?: string } | null
  selectError?: { message: string }
  /** Error returned by the Nth insert (1-based); later inserts succeed. */
  insertErrors?: ({ code?: string; message: string } | null)[]
}

function stubDb(opts: StubOptions = {}) {
  const inserted: Record<string, unknown>[] = []
  let insertCount = 0

  const db: VersionDb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        maybeSingle: async () => ({
                          data:  opts.selectError ? null : (opts.prev ?? null),
                          error: opts.selectError ?? null,
                        }),
                      }
                    },
                  }
                },
              }
            },
          }
        },
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row)
          const error = opts.insertErrors?.[insertCount] ?? null
          insertCount++
          return { error }
        },
      }
    },
  }
  return { db, inserted }
}

const base = {
  reportId:        'r1',
  clinicId:        'c1',
  findings:        'Résultats initiaux signés.',
  impression:      'Conclusion initiale signée.',
  recommendations: null,
  status:          'finalized',
  createdBy:       'u1',
}

describe('createReportVersion', () => {
  it('writes a snapshot and reports success', async () => {
    const { db, inserted } = stubDb({ prev: { version_number: 2 } })
    const result = await createReportVersion(db, { ...base, action: 'amended' })

    expect(result.error).toBeNull()
    expect(inserted).toHaveLength(1)
    expect(inserted[0].version_number).toBe(3)
    expect(inserted[0].action).toBe('amended')
  })

  it('preserves structured_data and the ORIGINAL signed_at in the snapshot', async () => {
    const { db, inserted } = stubDb({ prev: { version_number: 1 } })
    const structured = { results: 'Résultats initiaux signés.' }
    const signedAt = '2026-08-01T09:30:00.000Z'

    const result = await createReportVersion(db, {
      ...base, structuredData: structured, signedAt, action: 'amended',
      extraDiff: { previousSignedAt: signedAt },
    })

    expect(result.error).toBeNull()
    expect(inserted[0].structured_data).toEqual(structured)
    expect(inserted[0].signed_at).toBe(signedAt)
    expect((inserted[0].diff as Record<string, unknown>).previousSignedAt).toBe(signedAt)
  })

  it('surfaces an insert failure instead of silently succeeding', async () => {
    const { db } = stubDb({
      prev: { version_number: 1 },
      insertErrors: [{ message: 'permission denied for table report_versions' }],
    })
    const result = await createReportVersion(db, base)

    expect(result.error).toContain('Version snapshot failed')
    expect(result.error).toContain('permission denied')
  })

  it('surfaces a read failure on the version history', async () => {
    const { db } = stubDb({ selectError: { message: 'connection reset' } })
    const result = await createReportVersion(db, base)
    expect(result.error).toContain('Could not read the version history')
  })

  it('retries once on a version-number race (unique violation)', async () => {
    const { db, inserted } = stubDb({
      prev: { version_number: 4 },
      insertErrors: [{ code: '23505', message: 'duplicate key value' }, null],
    })
    const result = await createReportVersion(db, base)

    expect(result.error).toBeNull()
    expect(inserted).toHaveLength(2)
    expect(inserted[1].version_number).toBe(5)
  })

  it('degrades to the legacy column set when migration 039 is not applied yet', async () => {
    const { db, inserted } = stubDb({
      prev: { version_number: 1 },
      insertErrors: [{ code: 'PGRST204', message: "Could not find the 'structured_data' column" }, null],
    })
    const result = await createReportVersion(db, {
      ...base, structuredData: { results: 'x' }, signedAt: '2026-08-01T09:30:00.000Z',
    })

    expect(result.error).toBeNull()
    expect(inserted).toHaveLength(2)
    expect(inserted[0]).toHaveProperty('structured_data')
    expect(inserted[1]).not.toHaveProperty('structured_data')
    expect(inserted[1]).not.toHaveProperty('signed_at')
    // The clinical payload still lands.
    expect(inserted[1].findings).toBe(base.findings)
  })

  it('computes changed sections against the previous snapshot', async () => {
    const { db, inserted } = stubDb({
      prev: { version_number: 1, findings: 'Anciens résultats.', impression: 'Conclusion initiale signée.' },
    })
    await createReportVersion(db, base)

    const diff = inserted[0].diff as { changedSections: string[]; previousVersion: number }
    expect(diff.changedSections).toContain('results')
    expect(diff.changedSections).not.toContain('conclusion')
    expect(diff.previousVersion).toBe(1)
  })
})
