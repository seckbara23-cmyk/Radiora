// R0.2 — shared report-version snapshot writer.
//
// Replaces the three copy-pasted, silently-failing snapshot blocks in
// reports.ts / structuring.ts / ai.ts. supabase-js does NOT throw on failure —
// it returns { error } — so this module checks the returned error explicitly
// and reports it to the caller. The caller decides whether a failure blocks
// the operation (amendment: yes, it must abort) or degrades with an audit
// entry (routine draft saves).
//
// The snapshot now also carries structured_data and signed_at (added by
// migration 039) so the ENTIRE signed document — including the HPD JSON and
// the original signing timestamp — survives in the version history. When 039
// has not been applied yet, the insert is retried without the new columns so
// existing deployments keep working (degraded, but never silent: the caller
// still sees success, and the retry only strips the not-yet-existing columns).

export interface VersionSnapshotInput {
  reportId:        string
  clinicId:        string | null
  findings:        string
  impression:      string
  recommendations: string | null
  /** Full structured HPD payload at snapshot time (jsonb, may be null). */
  structuredData?: unknown
  /** The report's signed_at at snapshot time — preserves the original signing
   *  timestamp through the amendment history. */
  signedAt?:       string | null
  status:          string
  createdBy:       string
  /** What triggered the snapshot: saved | signed | amended. */
  action?:         string | null
  changeReason?:   string | null
  /** Extra keys merged into the diff jsonb (e.g. previousSignedAt on amend). */
  extraDiff?:      Record<string, unknown>
}

export interface VersionSnapshotResult {
  error: string | null
}

interface DbError {
  code?:   string
  message: string
}

interface PrevRow {
  version_number?:  number | null
  findings?:        string | null
  impression?:      string | null
  recommendations?: string | null
}

/** The narrow slice of the Supabase client this module uses — structural, so
 *  the real client satisfies it and tests can pass a stub. */
export interface VersionDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts: { ascending: boolean }): {
          limit(n: number): {
            maybeSingle(): PromiseLike<{ data: PrevRow | null; error: DbError | null }>
          }
        }
      }
    }
    insert(row: Record<string, unknown>): PromiseLike<{ error: DbError | null }>
  }
}

/** PostgREST reports a payload column missing from the schema as PGRST204;
 *  raw Postgres uses 42703 (undefined_column). */
function isMissingColumnError(error: DbError): boolean {
  return error.code === 'PGRST204' || error.code === '42703'
}

function isUniqueViolation(error: DbError): boolean {
  return error.code === '23505'
}

async function latestVersion(
  db: VersionDb,
  reportId: string,
): Promise<{ prev: PrevRow | null; error: DbError | null }> {
  const { data, error } = await db
    .from('report_versions')
    .select('version_number, findings, impression, recommendations')
    .eq('report_id', reportId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { prev: data, error }
}

async function insertSnapshot(
  db: VersionDb,
  row: Record<string, unknown>,
): Promise<DbError | null> {
  const { error } = await db.from('report_versions').insert(row)
  if (error && isMissingColumnError(error)) {
    // Migration 039 not applied yet — degrade to the legacy column set.
    const legacy = { ...row }
    delete legacy.structured_data
    delete legacy.signed_at
    const { error: legacyError } = await db.from('report_versions').insert(legacy)
    return legacyError
  }
  return error
}

/**
 * Write one version snapshot. Never throws; always reports the outcome.
 * Retries once on a version-number race (unique violation on concurrent saves).
 */
export async function createReportVersion(
  db: VersionDb,
  opts: VersionSnapshotInput,
): Promise<VersionSnapshotResult> {
  const { prev, error: readError } = await latestVersion(db, opts.reportId)
  if (readError) {
    return { error: `Could not read the version history: ${readError.message}` }
  }

  const buildRow = (prevRow: PrevRow | null): Record<string, unknown> => {
    const changed: string[] = []
    if ((prevRow?.findings ?? '') !== opts.findings) changed.push('results')
    if ((prevRow?.impression ?? '') !== opts.impression) changed.push('conclusion')
    if ((prevRow?.recommendations ?? '') !== (opts.recommendations ?? '')) changed.push('recommendations')
    const diff: Record<string, unknown> = {
      changedSections: prevRow ? changed : ['results', 'conclusion', 'recommendations'],
      previousVersion: prevRow?.version_number ?? null,
      ...(opts.extraDiff ?? {}),
    }
    return {
      report_id:       opts.reportId,
      clinic_id:       opts.clinicId,
      version_number:  (prevRow?.version_number ?? 0) + 1,
      findings:        opts.findings,
      impression:      opts.impression,
      recommendations: opts.recommendations,
      structured_data: opts.structuredData ?? null,
      signed_at:       opts.signedAt ?? null,
      status:          opts.status,
      created_by:      opts.createdBy,
      action:          opts.action ?? null,
      diff,
      change_reason:   opts.changeReason ?? null,
    }
  }

  let insertError = await insertSnapshot(db, buildRow(prev))

  if (insertError && isUniqueViolation(insertError)) {
    // Concurrent snapshot took our number — re-read and retry exactly once.
    const { prev: fresher, error: rereadError } = await latestVersion(db, opts.reportId)
    if (rereadError) {
      return { error: `Could not read the version history: ${rereadError.message}` }
    }
    insertError = await insertSnapshot(db, buildRow(fresher))
  }

  return { error: insertError ? `Version snapshot failed: ${insertError.message}` : null }
}
