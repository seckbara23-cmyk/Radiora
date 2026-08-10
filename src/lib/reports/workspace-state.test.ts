import { describe, it, expect } from 'vitest'
import {
  workspaceReducer,
  canStructure,
  canChooseMethod,
  isTerminal,
  isBusy,
  workspaceStep,
  type WorkspaceState,
  type WorkspaceEvent,
} from '@/lib/reports/workspace-state'

// R2.3 — the workspace state machine.
//
// The safety-critical property is that structuring is reachable ONLY from a
// COMPLETE transcript: no path carries interim speech into clinical sections.

const ALL_STATES: WorkspaceState[] = [
  'setup', 'ready_to_dictate', 'recording', 'phone_waiting', 'phone_recording',
  'audio_uploaded', 'transcribing', 'transcription_ready', 'structuring',
  'review_ready', 'saving', 'saved', 'signing_blocked', 'signed', 'error',
]

const run = (from: WorkspaceState, ...events: WorkspaceEvent[]) =>
  events.reduce(workspaceReducer, from)

describe('the happy path', () => {
  it('walks setup → signed through the workflow', () => {
    let s: WorkspaceState = 'setup'
    s = workspaceReducer(s, { type: 'REPORT_READY' });            expect(s).toBe('ready_to_dictate')
    s = workspaceReducer(s, { type: 'CHOOSE_METHOD', method: 'computer' }); expect(s).toBe('recording')
    s = workspaceReducer(s, { type: 'RECORDING_STOPPED' });        expect(s).toBe('transcribing')
    s = workspaceReducer(s, { type: 'TRANSCRIPT_READY' });         expect(s).toBe('transcription_ready')
    s = workspaceReducer(s, { type: 'STRUCTURE' });                expect(s).toBe('structuring')
    s = workspaceReducer(s, { type: 'STRUCTURED' });               expect(s).toBe('review_ready')
    s = workspaceReducer(s, { type: 'SAVE' });                     expect(s).toBe('saving')
    s = workspaceReducer(s, { type: 'SAVED' });                    expect(s).toBe('saved')
    s = workspaceReducer(s, { type: 'SIGNED' });                   expect(s).toBe('signed')
  })

  it('routes each dictation method to its own capture state', () => {
    const from: WorkspaceState = 'ready_to_dictate'
    expect(workspaceReducer(from, { type: 'CHOOSE_METHOD', method: 'computer' })).toBe('recording')
    expect(workspaceReducer(from, { type: 'CHOOSE_METHOD', method: 'phone' })).toBe('phone_waiting')
    // Import opens a file dialog in place — no separate capture state.
    expect(workspaceReducer(from, { type: 'CHOOSE_METHOD', method: 'import' })).toBe('ready_to_dictate')
  })

  it('completes the phone path', () => {
    expect(run('phone_waiting',
      { type: 'PHONE_CONNECTED' },
      { type: 'AUDIO_RECEIVED' },
      { type: 'TRANSCRIPT_READY' },
    )).toBe('transcription_ready')
  })

  it('completes the import path', () => {
    expect(run('ready_to_dictate',
      { type: 'TRANSCRIPT_READY' },
      { type: 'STRUCTURE' },
      { type: 'STRUCTURED' },
    )).toBe('review_ready')
  })
})

describe('SAFETY: interim speech never reaches clinical sections', () => {
  it('structuring is ENTERED only from a complete transcript', () => {
    for (const state of ALL_STATES) {
      const next = workspaceReducer(state, { type: 'STRUCTURE' })
      if (state === 'transcription_ready') {
        expect(next).toBe('structuring')
      } else if (state === 'structuring') {
        // Already structuring: the event is a no-op, not a new entry.
        expect(next).toBe('structuring')
      } else {
        expect(next, `STRUCTURE must not enter structuring from ${state}`).not.toBe('structuring')
      }
    }
  })

  it('canStructure agrees with the reducer', () => {
    for (const state of ALL_STATES) {
      expect(canStructure(state)).toBe(state === 'transcription_ready')
    }
  })

  it('a recording in progress cannot jump straight to review', () => {
    expect(workspaceReducer('recording', { type: 'STRUCTURED' })).toBe('recording')
    expect(workspaceReducer('phone_recording', { type: 'STRUCTURE' })).toBe('phone_recording')
  })
})

describe('a signed report is terminal', () => {
  it('accepts no further events', () => {
    for (const event of [
      { type: 'EDIT' }, { type: 'SAVE' }, { type: 'STRUCTURE' },
      { type: 'RESET' }, { type: 'CHOOSE_METHOD', method: 'computer' },
    ] as WorkspaceEvent[]) {
      expect(workspaceReducer('signed', event), event.type).toBe('signed')
    }
  })

  it('is reported as terminal', () => {
    expect(isTerminal('signed')).toBe(true)
    for (const s of ALL_STATES.filter((x) => x !== 'signed')) {
      expect(isTerminal(s), s).toBe(false)
    }
  })
})

describe('rejected transitions', () => {
  it('ignores an unknown event rather than crashing or jumping', () => {
    expect(workspaceReducer('setup', { type: 'SIGNED' })).toBe('setup')
    expect(workspaceReducer('setup', { type: 'SAVE' })).toBe('setup')
    expect(workspaceReducer('review_ready', { type: 'PHONE_CONNECTED' })).toBe('review_ready')
  })

  it('cannot sign straight from setup', () => {
    expect(run('setup', { type: 'SIGNED' })).toBe('setup')
  })

  it('a method may only be chosen when the workspace is idle', () => {
    expect(canChooseMethod('ready_to_dictate')).toBe(true)
    expect(canChooseMethod('review_ready')).toBe(true)
    expect(canChooseMethod('saved')).toBe(true)
    for (const s of ['recording', 'structuring', 'saving', 'signed', 'setup'] as WorkspaceState[]) {
      expect(canChooseMethod(s), s).toBe(false)
      expect(workspaceReducer(s, { type: 'CHOOSE_METHOD', method: 'phone' }), s).toBe(s)
    }
  })
})

describe('recovery', () => {
  it('every non-terminal state can fail', () => {
    for (const s of ALL_STATES.filter((x) => x !== 'signed' && x !== 'error')) {
      expect(workspaceReducer(s, { type: 'FAIL' }), s).toBe('error')
    }
  })

  it('an error can be retried without losing the report', () => {
    expect(run('error', { type: 'RETRY' })).toBe('ready_to_dictate')
    expect(run('error', { type: 'RESET' })).toBe('ready_to_dictate')
  })

  it('a blocked signature returns to review, it does not dead-end', () => {
    expect(workspaceReducer('signing_blocked', { type: 'EDIT' })).toBe('review_ready')
    expect(workspaceReducer('signing_blocked', { type: 'SAVE' })).toBe('saving')
  })

  it('another dictation pass can start on the same report', () => {
    expect(workspaceReducer('review_ready', { type: 'RESET' })).toBe('ready_to_dictate')
    expect(workspaceReducer('saved', { type: 'RESET' })).toBe('ready_to_dictate')
  })
})

describe('derived display helpers', () => {
  it('reports a busy state only while work is in flight', () => {
    expect(isBusy('structuring')).toBe(true)
    expect(isBusy('saving')).toBe(true)
    expect(isBusy('review_ready')).toBe(false)
    expect(isBusy('recording')).toBe(false)
  })

  it('maps states onto four workflow steps', () => {
    expect(workspaceStep('setup')).toBe(1)
    expect(workspaceStep('recording')).toBe(2)
    expect(workspaceStep('phone_waiting')).toBe(2)
    expect(workspaceStep('transcription_ready')).toBe(3)
    expect(workspaceStep('structuring')).toBe(3)
    expect(workspaceStep('review_ready')).toBe(4)
    expect(workspaceStep('signed')).toBe(4)
  })

  it('every state maps to a step', () => {
    for (const s of ALL_STATES) {
      expect([1, 2, 3, 4]).toContain(workspaceStep(s))
    }
  })
})
