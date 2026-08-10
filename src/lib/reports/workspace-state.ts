// R2.3 — the New Report workspace state machine.
//
// One finite state model instead of scattered booleans. The doctor experiences a
// single workflow; this is the vocabulary behind it:
//
//   setup → ready_to_dictate → (recording | phone_* | audio_uploaded)
//         → transcribing → transcription_ready → structuring → review_ready
//         → saving → saved → signed
//
// Pure — no IO, no React, no clock. The workspace component derives what to
// render from `state`; nothing else decides independently.
//
// SAFETY: there is deliberately NO transition that carries interim speech into
// clinical report sections. Structuring is only reachable from
// `transcription_ready`, i.e. after a COMPLETE transcript exists. Live section
// population stays out of R2.3 (see the R1 freeze §8.1 — the engine is
// non-monotonic on partial input).

export type WorkspaceState =
  | 'setup'                // choosing patient / examination
  | 'ready_to_dictate'     // a draft report exists; pick a dictation method
  | 'recording'            // workstation microphone is capturing
  | 'phone_waiting'        // QR shown, phone not yet connected
  | 'phone_recording'      // phone connected and capturing
  | 'audio_uploaded'       // an audio file landed (import or phone)
  | 'transcribing'         // transcript being written / edited
  | 'transcription_ready'  // a complete transcript exists
  | 'structuring'          // canonical pipeline running
  | 'review_ready'         // structured draft ready for the radiologist
  | 'saving'
  | 'saved'
  | 'signing_blocked'      // the signing gate refused
  | 'signed'
  | 'error'

export type DictationMethod = 'computer' | 'phone' | 'import'

export type WorkspaceEvent =
  | { type: 'REPORT_READY' }
  | { type: 'CHOOSE_METHOD'; method: DictationMethod }
  | { type: 'RECORDING_STOPPED' }
  | { type: 'PHONE_CONNECTED' }
  | { type: 'AUDIO_RECEIVED' }
  | { type: 'TRANSCRIPT_READY' }
  | { type: 'STRUCTURE' }
  | { type: 'STRUCTURED' }
  | { type: 'SAVE' }
  | { type: 'SAVED' }
  | { type: 'SIGN_BLOCKED' }
  | { type: 'SIGNED' }
  | { type: 'EDIT' }        // back to review from saved / blocked
  | { type: 'RESET' }       // start another dictation pass on the same report
  | { type: 'FAIL' }
  | { type: 'RETRY' }

/** Terminal for this workspace: a signed report is immutable. */
export function isTerminal(state: WorkspaceState): boolean {
  return state === 'signed'
}

/** States in which a dictation method may still be chosen. */
export function canChooseMethod(state: WorkspaceState): boolean {
  return state === 'ready_to_dictate' || state === 'review_ready' || state === 'saved'
}

/** Structuring is reachable ONLY from a complete transcript. */
export function canStructure(state: WorkspaceState): boolean {
  return state === 'transcription_ready'
}

const TRANSITIONS: Record<WorkspaceState, Partial<Record<WorkspaceEvent['type'], WorkspaceState>>> = {
  setup: {
    REPORT_READY: 'ready_to_dictate',
    FAIL: 'error',
  },
  ready_to_dictate: {
    CHOOSE_METHOD: 'ready_to_dictate', // resolved below — depends on the method
    TRANSCRIPT_READY: 'transcription_ready',
    FAIL: 'error',
  },
  recording: {
    RECORDING_STOPPED: 'transcribing',
    TRANSCRIPT_READY: 'transcription_ready',
    FAIL: 'error',
  },
  phone_waiting: {
    PHONE_CONNECTED: 'phone_recording',
    AUDIO_RECEIVED: 'audio_uploaded',
    RESET: 'ready_to_dictate',
    FAIL: 'error',
  },
  phone_recording: {
    AUDIO_RECEIVED: 'audio_uploaded',
    RESET: 'ready_to_dictate',
    FAIL: 'error',
  },
  audio_uploaded: {
    TRANSCRIPT_READY: 'transcription_ready',
    FAIL: 'error',
  },
  transcribing: {
    TRANSCRIPT_READY: 'transcription_ready',
    FAIL: 'error',
  },
  transcription_ready: {
    STRUCTURE: 'structuring',
    RESET: 'ready_to_dictate',
    FAIL: 'error',
  },
  structuring: {
    STRUCTURED: 'review_ready',
    FAIL: 'error',
  },
  review_ready: {
    SAVE: 'saving',
    CHOOSE_METHOD: 'review_ready', // resolved below
    RESET: 'ready_to_dictate',
    SIGN_BLOCKED: 'signing_blocked',
    SIGNED: 'signed',
    FAIL: 'error',
  },
  saving: {
    SAVED: 'saved',
    FAIL: 'error',
  },
  saved: {
    EDIT: 'review_ready',
    CHOOSE_METHOD: 'saved', // resolved below
    RESET: 'ready_to_dictate',
    SIGN_BLOCKED: 'signing_blocked',
    SIGNED: 'signed',
    FAIL: 'error',
  },
  signing_blocked: {
    EDIT: 'review_ready',
    SAVE: 'saving',
    SIGNED: 'signed',
    RESET: 'ready_to_dictate',
    FAIL: 'error',
  },
  signed: {
    // Immutable. Amendment is a separate, explicit workflow that re-opens the
    // report and starts a fresh workspace.
  },
  error: {
    RETRY: 'ready_to_dictate',
    RESET: 'ready_to_dictate',
  },
}

/** Where a chosen dictation method takes the workspace. */
function methodTarget(method: DictationMethod): WorkspaceState {
  switch (method) {
    case 'computer': return 'recording'
    case 'phone':    return 'phone_waiting'
    case 'import':   return 'ready_to_dictate' // the file dialog runs in place
  }
}

/**
 * Apply an event. Returns the SAME state when the transition is not allowed —
 * an invalid event is ignored, never a crash and never an illegal jump.
 */
export function workspaceReducer(state: WorkspaceState, event: WorkspaceEvent): WorkspaceState {
  const allowed = TRANSITIONS[state]?.[event.type]
  if (allowed === undefined) return state

  if (event.type === 'CHOOSE_METHOD') {
    if (!canChooseMethod(state)) return state
    return methodTarget(event.method)
  }
  return allowed
}

/** Is this event accepted in this state? */
export function canTransition(state: WorkspaceState, event: WorkspaceEvent): boolean {
  return workspaceReducer(state, event) !== state || event.type === 'CHOOSE_METHOD'
    ? TRANSITIONS[state]?.[event.type] !== undefined
    : false
}

/** Progress step (1-based) for the workspace stepper. */
export function workspaceStep(state: WorkspaceState): 1 | 2 | 3 | 4 {
  switch (state) {
    case 'setup':
      return 1
    case 'ready_to_dictate':
    case 'recording':
    case 'phone_waiting':
    case 'phone_recording':
    case 'audio_uploaded':
    case 'transcribing':
      return 2
    case 'transcription_ready':
    case 'structuring':
      return 3
    default:
      return 4
  }
}

/** True while a long-running operation is in flight (disables primary actions). */
export function isBusy(state: WorkspaceState): boolean {
  return state === 'structuring' || state === 'saving'
}
