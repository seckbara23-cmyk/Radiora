// R0.5 — brute-force lockout policy for the PUBLIC delivery password gate.
//
// The patient channel derives its password from the date of birth (DDMMYYYY),
// so the search space is small enough to enumerate offline in seconds. The
// endpoints are unauthenticated by design, so the only thing standing between a
// leaked token and the patient's report was an unlimited number of guesses.
//
// Pure and deterministic (no IO, no clock): the caller supplies `nowISO` and
// persists the returned counters. State lives on the report_deliveries ROW
// rather than in process memory because the app runs serverless — an in-memory
// limiter resets on every cold start and is not shared between instances.

/** Failed attempts tolerated before the link locks. */
export const MAX_FAILED_ATTEMPTS = 5

/** How long a locked link stays locked. */
export const LOCKOUT_MINUTES = 15

export interface AttemptState {
  failedAttempts: number
  lockedUntil: string | null
}

export interface LockStatus {
  locked: boolean
  /** Seconds until the caller may try again (0 when unlocked). */
  retryAfterSeconds: number
}

function toEpoch(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

/** Is this delivery currently locked out? */
export function evaluateLock(state: AttemptState, nowISO: string): LockStatus {
  const until = toEpoch(state.lockedUntil)
  const now = toEpoch(nowISO)
  if (until === null || now === null || now >= until) {
    return { locked: false, retryAfterSeconds: 0 }
  }
  return { locked: true, retryAfterSeconds: Math.ceil((until - now) / 1000) }
}

/**
 * Next persisted state after a FAILED password attempt. Reaching
 * MAX_FAILED_ATTEMPTS arms the lockout window; the counter keeps climbing while
 * locked so repeated waves extend nothing but also never silently reset.
 */
export function registerFailure(state: AttemptState, nowISO: string): AttemptState {
  const now = toEpoch(nowISO)
  const until = toEpoch(state.lockedUntil)

  // A lapsed lockout starts a fresh window rather than compounding forever.
  const base = until !== null && now !== null && now >= until ? 0 : state.failedAttempts
  const failedAttempts = base + 1

  if (failedAttempts >= MAX_FAILED_ATTEMPTS && now !== null) {
    return {
      failedAttempts,
      lockedUntil: new Date(now + LOCKOUT_MINUTES * 60_000).toISOString(),
    }
  }
  return { failedAttempts, lockedUntil: base === 0 ? null : state.lockedUntil }
}

/** Next persisted state after a SUCCESSFUL unlock — the gate resets. */
export function registerSuccess(): AttemptState {
  return { failedAttempts: 0, lockedUntil: null }
}
