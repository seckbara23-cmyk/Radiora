// R2.7 — the phone handoff, as a pure state vocabulary.
//
// The doctor should experience the phone as another microphone for the SAME
// report. They should never meet the words "session", "token", "capability" or
// "vacation item". This module is the single place that turns the database's
// session status into something a clinician reads, and it exists as pure code
// so the mapping is testable without a browser or a database.
//
// It deliberately does NOT define a second state machine. The R2.3
// `workspaceReducer` remains the only authority over workspace state; this
// module only says which EVENT a given session status should send it.
//
// One correctness rule drove most of this file: a session that has passed its
// TTL is expired whether or not anything has written that to the database yet.
// Before R2.7 nothing marked a stale session expired except an upload attempt,
// so `pending` was reported forever and the desktop polled every 2.5 s
// indefinitely after the QR had died.

import type { DictationSessionStatus } from '@/types/dictation'
import type { WorkspaceEvent } from '@/lib/reports/workspace-state'

/** Statuses after which nothing further can happen to the session. */
export const TERMINAL_SESSION_STATUSES: DictationSessionStatus[] = [
  'completed', 'expired', 'cancelled',
]

export function isTerminalSessionStatus(status: DictationSessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status)
}

/**
 * Has the TTL passed? Independent of what the row says, because the row is only
 * updated when something touches the session.
 */
export function isSessionExpired(
  status: DictationSessionStatus,
  expiresAt: string | null | undefined,
  now: number,
): boolean {
  if (isTerminalSessionStatus(status)) return status === 'expired'
  if (!expiresAt) return false
  const at = new Date(expiresAt).getTime()
  return Number.isFinite(at) && at <= now
}

/**
 * The status the desktop should act on. Resolves a live-looking row whose TTL
 * has quietly passed to `expired`.
 */
export function effectiveSessionStatus(
  status: DictationSessionStatus,
  expiresAt: string | null | undefined,
  now: number,
): DictationSessionStatus {
  return isSessionExpired(status, expiresAt, now) ? 'expired' : status
}

/** Keep polling only while something can still change. */
export function shouldContinuePolling(
  status: DictationSessionStatus,
  expiresAt: string | null | undefined,
  now: number,
): boolean {
  return !isTerminalSessionStatus(effectiveSessionStatus(status, expiresAt, now))
}

/** Whole seconds left on the QR, floored at zero. */
export function secondsRemaining(expiresAt: string | null | undefined, now: number): number {
  if (!expiresAt) return 0
  const at = new Date(expiresAt).getTime()
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.floor((at - now) / 1000))
}

export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── What the doctor reads ────────────────────────────────────────────────────

/**
 * The handoff as a clinician experiences it. These map 1:1 onto i18n keys and
 * carry no database vocabulary.
 *
 * `received` is deliberately the end of the PHONE's part of the story. What
 * follows is a transcript being written — and in Radiora today that is done by a
 * person, not by a speech engine. There is no automatic transcription of
 * uploaded audio anywhere in this codebase, so the vocabulary must not imply
 * that a machine is working on it.
 */
export type PhoneHandoffStage =
  | 'waiting'      // QR on screen, phone has not opened the link
  | 'connected'    // phone opened the link
  | 'recording'    // phone is capturing
  | 'received'     // audio uploaded and attached to the report
  | 'expired'      // TTL passed
  | 'cancelled'    // desktop cancelled

const STAGE_BY_STATUS: Record<DictationSessionStatus, PhoneHandoffStage> = {
  pending:   'waiting',
  connected: 'connected',
  recording: 'recording',
  completed: 'received',
  expired:   'expired',
  cancelled: 'cancelled',
}

export function phoneHandoffStage(
  status: DictationSessionStatus,
  expiresAt: string | null | undefined,
  now: number,
): PhoneHandoffStage {
  return STAGE_BY_STATUS[effectiveSessionStatus(status, expiresAt, now)]
}

/** A stage the doctor can still act on by waiting. */
export function isLiveStage(stage: PhoneHandoffStage): boolean {
  return stage === 'waiting' || stage === 'connected' || stage === 'recording'
}

/** Something went wrong / the link died — offer a fresh QR. */
export function needsNewSession(stage: PhoneHandoffStage): boolean {
  return stage === 'expired' || stage === 'cancelled'
}

// ─── Driving the R2.3 workspace, not replacing it ─────────────────────────────

/**
 * Which workspace event (if any) a session status should send.
 *
 * Returning `null` means "nothing to do" — the reducer is never handed an event
 * just to keep two models in step. There is exactly one workspace state machine
 * and it lives in `workspace-state.ts`.
 */
export function workspaceEventForStatus(
  status: DictationSessionStatus,
  expiresAt: string | null | undefined,
  now: number,
): WorkspaceEvent | null {
  switch (effectiveSessionStatus(status, expiresAt, now)) {
    case 'connected':
    case 'recording':
      return { type: 'PHONE_CONNECTED' }
    case 'completed':
      return { type: 'AUDIO_RECEIVED' }
    case 'expired':
    case 'cancelled':
      return { type: 'FAIL' }
    case 'pending':
    default:
      return null
  }
}
