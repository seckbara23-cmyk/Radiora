// Phase 5F — Clinic Analytics.
//
// Pure, deterministic aggregation helpers for the clinic-level commercial
// metrics: reports/day, reports/month, average turnaround, dictation volume,
// validation delays and secretary productivity.
//
// These functions take already-fetched rows (no IO) so they are fully unit
// testable. The data reader in src/lib/data/analytics.ts fetches the rows and
// feeds them here; the page only renders the result. Keeping the maths here
// means the same logic powers the screen and any future export.
//
// All time bucketing is done in UTC against a caller-supplied `nowISO` — never
// Date.now() — so results are stable and testable.

const DAY_MS = 86_400_000

// ── Per-day report counts ─────────────────────────────────────────────────────

export interface DayCount {
  date: string // YYYY-MM-DD (UTC)
  count: number
}

function utcDayKey(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Bucket ISO timestamps into per-UTC-day counts for the `days`-day window
 * ending on nowISO's day (inclusive). Zero-filled and chronological, so a
 * sparse stream still renders a continuous series.
 */
export function reportsPerDay(timestamps: string[], nowISO: string, days = 30): DayCount[] {
  const span = Math.max(1, Math.floor(days))
  const endDayStart = Date.parse(`${utcDayKey(nowISO)}T00:00:00.000Z`)

  // Pre-seed every day in the window with a zero count.
  const buckets = new Map<string, number>()
  const order: string[] = []
  for (let i = span - 1; i >= 0; i--) {
    const key = new Date(endDayStart - i * DAY_MS).toISOString().slice(0, 10)
    buckets.set(key, 0)
    order.push(key)
  }

  const earliest = endDayStart - (span - 1) * DAY_MS
  for (const ts of timestamps) {
    if (!ts) continue
    const t = Date.parse(ts)
    if (Number.isNaN(t) || t < earliest || t >= endDayStart + DAY_MS) continue
    const key = utcDayKey(ts)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return order.map((date) => ({ date, count: buckets.get(date) ?? 0 }))
}

/** Count timestamps falling in the same UTC calendar month as nowISO. */
export function countInMonth(timestamps: string[], nowISO: string): number {
  const ym = nowISO.slice(0, 7) // YYYY-MM
  let n = 0
  for (const ts of timestamps) {
    if (ts && ts.slice(0, 7) === ym) n++
  }
  return n
}

// ── Averages over spans ───────────────────────────────────────────────────────

export interface Span {
  start: string // earlier ISO timestamp
  end: string // later ISO timestamp
}

/** Rounded mean of a list of numbers; 0 for an empty list. */
export function roundedMean(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Average duration, in whole minutes, of a set of spans. Spans that are
 * missing an endpoint, unparseable or non-positive (end before start) are
 * skipped — they represent work not yet finished, not a zero-minute span.
 * Returns { avgMinutes, count } where count is the number of valid spans.
 */
export function averageSpanMinutes(spans: Span[]): { avgMinutes: number; count: number } {
  const minutes: number[] = []
  for (const { start, end } of spans) {
    if (!start || !end) continue
    const a = Date.parse(start)
    const b = Date.parse(end)
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const m = (b - a) / 60_000
    if (m > 0) minutes.push(m)
  }
  return { avgMinutes: roundedMean(minutes), count: minutes.length }
}

// ── Dictation volume ──────────────────────────────────────────────────────────

export interface DictationVolume {
  sessions: number // total dictation sessions in range
  totalSeconds: number // summed audio duration of sessions that report one
  avgSeconds: number // mean duration over sessions that report one
}

/**
 * Summarise audio dictation volume from a list of per-session durations.
 * `sessions` counts every entry (a session with no recorded duration still
 * happened); totals/averages only consider entries with a positive duration.
 */
export function summariseDictation(durationsSeconds: Array<number | null | undefined>): DictationVolume {
  const durations: number[] = []
  for (const d of durationsSeconds) {
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) durations.push(d)
  }
  const totalSeconds = durations.reduce((a, b) => a + b, 0)
  return {
    sessions: durationsSeconds.length,
    totalSeconds,
    avgSeconds: roundedMean(durations),
  }
}

// ── Secretary productivity ────────────────────────────────────────────────────

export interface SecretaryRow {
  userId: string
  firstName: string
  lastName: string
  actions: number
}

/**
 * Tally audit-log actions per secretary. `secretaries` is the roster (so a
 * secretary with zero actions in range still appears); `events` is the list of
 * { userId } audit entries to count. Sorted by activity, busiest first.
 */
export function secretaryProductivity(
  secretaries: Array<{ userId: string; firstName: string; lastName: string }>,
  events: Array<{ userId: string | null }>,
): SecretaryRow[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (!e.userId) continue
    counts.set(e.userId, (counts.get(e.userId) ?? 0) + 1)
  }
  return secretaries
    .map((s) => ({ ...s, actions: counts.get(s.userId) ?? 0 }))
    .sort((a, b) => b.actions - a.actions)
}
