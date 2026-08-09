import { describe, it, expect } from 'vitest'
import {
  evaluateLock,
  registerFailure,
  registerSuccess,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
  type AttemptState,
} from '@/lib/delivery/lockout'

// R0.5 — the public delivery gate is unauthenticated and the patient-channel
// password is a DDMMYYYY date of birth, so an unthrottled endpoint is a
// few-thousand-request brute force. These pin the lockout policy.

const T0 = '2026-08-09T12:00:00.000Z'
const fresh: AttemptState = { failedAttempts: 0, lockedUntil: null }
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()

describe('evaluateLock', () => {
  it('a fresh delivery is not locked', () => {
    expect(evaluateLock(fresh, T0)).toEqual({ locked: false, retryAfterSeconds: 0 })
  })

  it('reports remaining seconds while locked', () => {
    const state = { failedAttempts: 5, lockedUntil: plus(T0, 60_000) }
    const status = evaluateLock(state, T0)
    expect(status.locked).toBe(true)
    expect(status.retryAfterSeconds).toBe(60)
  })

  it('unlocks once the window has passed', () => {
    const state = { failedAttempts: 5, lockedUntil: plus(T0, 60_000) }
    expect(evaluateLock(state, plus(T0, 61_000)).locked).toBe(false)
  })

  it('treats an unparseable timestamp as unlocked rather than throwing', () => {
    expect(evaluateLock({ failedAttempts: 9, lockedUntil: 'not-a-date' }, T0).locked).toBe(false)
  })
})

describe('registerFailure', () => {
  it('counts up without locking below the threshold', () => {
    let state = fresh
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      state = registerFailure(state, T0)
      expect(state.failedAttempts).toBe(i)
      expect(state.lockedUntil).toBeNull()
    }
  })

  it(`locks for ${LOCKOUT_MINUTES} minutes on attempt ${MAX_FAILED_ATTEMPTS}`, () => {
    let state = fresh
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) state = registerFailure(state, T0)

    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS)
    expect(state.lockedUntil).toBe(plus(T0, LOCKOUT_MINUTES * 60_000))
    expect(evaluateLock(state, T0).locked).toBe(true)
  })

  it('a brute-force run of 1000 guesses cannot get past the threshold', () => {
    let state = fresh
    let allowed = 0
    for (let i = 0; i < 1000; i++) {
      if (!evaluateLock(state, T0).locked) {
        allowed++
        state = registerFailure(state, T0)
      }
    }
    // Only MAX_FAILED_ATTEMPTS guesses land inside one lockout window.
    expect(allowed).toBe(MAX_FAILED_ATTEMPTS)
  })

  it('starts a fresh window after a lapsed lockout instead of compounding', () => {
    let state = fresh
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) state = registerFailure(state, T0)

    const later = plus(T0, (LOCKOUT_MINUTES + 1) * 60_000)
    const next = registerFailure(state, later)
    expect(next.failedAttempts).toBe(1)
    expect(next.lockedUntil).toBeNull()
  })
})

describe('registerSuccess', () => {
  it('clears the counters so a legitimate patient is not penalised', () => {
    expect(registerSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null })
  })
})
