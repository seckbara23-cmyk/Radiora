import { describe, it, expect } from 'vitest'
import {
  isTerminalSessionStatus,
  isSessionExpired,
  effectiveSessionStatus,
  shouldContinuePolling,
  secondsRemaining,
  formatRemaining,
  phoneHandoffStage,
  isLiveStage,
  needsNewSession,
  workspaceEventForStatus,
} from '@/lib/dictation/session-status'
import { workspaceReducer, type WorkspaceState } from '@/lib/reports/workspace-state'

// R2.7 — the phone handoff vocabulary and its lifecycle rules.

const NOW = Date.parse('2026-08-10T12:00:00.000Z')
const in10min = new Date(NOW + 10 * 60_000).toISOString()
const ago1min = new Date(NOW - 60_000).toISOString()

describe('terminal statuses', () => {
  it('16. nothing further happens after a terminal status', () => {
    for (const s of ['completed', 'expired', 'cancelled'] as const) {
      expect(isTerminalSessionStatus(s), s).toBe(true)
      expect(shouldContinuePolling(s, in10min, NOW), s).toBe(false)
    }
    for (const s of ['pending', 'connected', 'recording'] as const) {
      expect(isTerminalSessionStatus(s), s).toBe(false)
      expect(shouldContinuePolling(s, in10min, NOW), s).toBe(true)
    }
  })
})

describe('5. expiry is resolved against the clock, not just the row', () => {
  it('a live-looking session past its TTL is expired', () => {
    // This is the bug: nothing wrote `expired` to the row, so the desktop was
    // told `pending` forever and polled a dead QR indefinitely.
    expect(isSessionExpired('pending', ago1min, NOW)).toBe(true)
    expect(effectiveSessionStatus('pending', ago1min, NOW)).toBe('expired')
    expect(shouldContinuePolling('pending', ago1min, NOW)).toBe(false)
  })

  it('a session inside its TTL is untouched', () => {
    expect(effectiveSessionStatus('pending', in10min, NOW)).toBe('pending')
    expect(effectiveSessionStatus('recording', in10min, NOW)).toBe('recording')
  })

  it('a completed session is never re-labelled expired', () => {
    // The recording arrived; the TTL passing afterwards changes nothing.
    expect(effectiveSessionStatus('completed', ago1min, NOW)).toBe('completed')
    expect(isSessionExpired('completed', ago1min, NOW)).toBe(false)
  })

  it('6. a cancelled session stays cancelled', () => {
    expect(effectiveSessionStatus('cancelled', ago1min, NOW)).toBe('cancelled')
    expect(shouldContinuePolling('cancelled', in10min, NOW)).toBe(false)
  })

  it('a missing or unparseable expiry never fabricates an expiry', () => {
    expect(isSessionExpired('pending', null, NOW)).toBe(false)
    expect(isSessionExpired('pending', 'not-a-date', NOW)).toBe(false)
  })

  it('expiry is exact at the boundary', () => {
    const exactly = new Date(NOW).toISOString()
    expect(isSessionExpired('pending', exactly, NOW)).toBe(true)
    expect(isSessionExpired('pending', new Date(NOW + 1000).toISOString(), NOW)).toBe(false)
  })
})

describe('countdown', () => {
  it('counts down and floors at zero', () => {
    expect(secondsRemaining(in10min, NOW)).toBe(600)
    expect(secondsRemaining(ago1min, NOW)).toBe(0)
    expect(secondsRemaining(null, NOW)).toBe(0)
  })

  it('formats as minutes:seconds', () => {
    expect(formatRemaining(600)).toBe('10:00')
    expect(formatRemaining(65)).toBe('1:05')
    expect(formatRemaining(0)).toBe('0:00')
  })
})

describe('10-15. what the doctor reads', () => {
  const cases: Array<[Parameters<typeof phoneHandoffStage>[0], string]> = [
    ['pending', 'waiting'],
    ['connected', 'connected'],
    ['recording', 'recording'],
    ['completed', 'received'],
    ['expired', 'expired'],
    ['cancelled', 'cancelled'],
  ]

  for (const [status, stage] of cases) {
    it(`${status} reads as "${stage}"`, () => {
      expect(phoneHandoffStage(status, in10min, NOW)).toBe(stage)
    })
  }

  it('an expired TTL reads as expired whatever the row says', () => {
    expect(phoneHandoffStage('connected', ago1min, NOW)).toBe('expired')
  })

  it('live stages are the ones worth waiting on', () => {
    expect(isLiveStage('waiting')).toBe(true)
    expect(isLiveStage('connected')).toBe(true)
    expect(isLiveStage('recording')).toBe(true)
    expect(isLiveStage('received')).toBe(false)
    expect(isLiveStage('expired')).toBe(false)
  })

  it('a dead link offers a new one', () => {
    expect(needsNewSession('expired')).toBe(true)
    expect(needsNewSession('cancelled')).toBe(true)
    expect(needsNewSession('received')).toBe(false)
    expect(needsNewSession('waiting')).toBe(false)
  })
})

describe('there is only one workspace state machine', () => {
  it('a status maps to an EVENT, never to a state', () => {
    expect(workspaceEventForStatus('connected', in10min, NOW)).toEqual({ type: 'PHONE_CONNECTED' })
    expect(workspaceEventForStatus('recording', in10min, NOW)).toEqual({ type: 'PHONE_CONNECTED' })
    expect(workspaceEventForStatus('completed', in10min, NOW)).toEqual({ type: 'AUDIO_RECEIVED' })
    expect(workspaceEventForStatus('expired', in10min, NOW)).toEqual({ type: 'FAIL' })
    expect(workspaceEventForStatus('cancelled', in10min, NOW)).toEqual({ type: 'FAIL' })
  })

  it('pending sends nothing — the reducer is not poked to stay in step', () => {
    expect(workspaceEventForStatus('pending', in10min, NOW)).toBeNull()
  })

  it('the real reducer accepts every event this module emits', () => {
    const states: WorkspaceState[] = ['phone_waiting', 'phone_recording']
    for (const status of ['connected', 'recording', 'completed', 'expired'] as const) {
      const event = workspaceEventForStatus(status, in10min, NOW)
      if (!event) continue
      for (const from of states) {
        // Never throws, never lands somewhere illegal.
        expect(typeof workspaceReducer(from, event)).toBe('string')
      }
    }
  })

  it('drives the documented desktop sequence end to end', () => {
    let s: WorkspaceState = 'ready_to_dictate'
    s = workspaceReducer(s, { type: 'CHOOSE_METHOD', method: 'phone' })
    expect(s).toBe('phone_waiting')

    s = workspaceReducer(s, workspaceEventForStatus('connected', in10min, NOW)!)
    expect(s).toBe('phone_recording')

    s = workspaceReducer(s, workspaceEventForStatus('completed', in10min, NOW)!)
    expect(s).toBe('audio_uploaded')

    // From here the transcript is written by a person; the workspace continues
    // through its normal transcript → structure path.
    s = workspaceReducer(s, { type: 'TRANSCRIPT_READY' })
    expect(s).toBe('transcription_ready')
  })
})
