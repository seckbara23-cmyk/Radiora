// R0.8A — clinical authority for the vacation (dictation queue) workflow.
//
// Single source of truth for who may move a queue item between workflow states,
// and in what order. Mirrors lib/safety/immutability.ts for reports: the server
// action, the UI control and the database trigger all derive their rules from
// this one contract so they cannot drift apart.
//
// THE RULE: clinical validation and signing are the radiologist's alone.
// clinic_admin is an ADMINISTRATIVE authority (users, branding, templates) and
// super_admin is a PLATFORM authority (tenants, billing) — neither carries a
// clinical override, because signing asserts medical authorship. This module
// deliberately routes through canValidateReports() so the queue can never grant
// authority the report-signing gate withholds.
//
// Pure and dependency-light: no IO, no clock, no Supabase.

import { canValidateReports } from '@/lib/safety/authority'
import type { UserRole } from '@/types/user'
import type { VacationWorkflowStatus } from '@/types/vacation'

/** States that assert a clinical decision — radiologist only. */
export const CLINICAL_AUTHORITY_STATES: VacationWorkflowStatus[] = ['validated', 'signed']

/**
 * States a report must already be in before it may be printed or exported.
 * 'printed' and 'exported' are both terminal distribution steps, so both
 * require a signed predecessor — leaving 'printed' unguarded was the hole that
 * made the export check bypassable (audit H1).
 */
export const POST_SIGN_STATES: VacationWorkflowStatus[] = ['signed', 'printed', 'exported']

/** Distribution states that may only follow a signed report. */
export const DISTRIBUTION_STATES: VacationWorkflowStatus[] = ['printed', 'exported']

export interface TransitionCheck {
  allowed: boolean
  reason: string | null
}

const OK: TransitionCheck = { allowed: true, reason: null }

/**
 * Who may move a queue item into 'validated' or 'signed'.
 * Radiologist only — there is no administrative clinical override.
 */
export function canValidateQueueItem(role: UserRole | null | undefined): boolean {
  // A missing/unresolved role fails CLOSED rather than falling through to a
  // permissive default.
  if (!role) return false
  return canValidateReports(role)
}

/**
 * Evaluate a queue-item workflow transition.
 *
 * `actorRole` must be the SERVER-RESOLVED role (from the caller's profile row),
 * never a value supplied by the client. `from` is the item's persisted status.
 */
export function evaluateQueueTransition(input: {
  from: VacationWorkflowStatus | null | undefined
  to: VacationWorkflowStatus
  actorRole: UserRole | null | undefined
}): TransitionCheck {
  const { from, to, actorRole } = input

  // ── Clinical authority ──────────────────────────────────────────────────────
  if (CLINICAL_AUTHORITY_STATES.includes(to)) {
    if (!canValidateQueueItem(actorRole)) {
      return {
        allowed: false,
        reason: 'Only a radiologist can validate or sign a report.',
      }
    }
    return OK
  }

  // ── Validation before distribution ──────────────────────────────────────────
  if (DISTRIBUTION_STATES.includes(to)) {
    if (!from || !POST_SIGN_STATES.includes(from)) {
      return {
        allowed: false,
        reason:
          'The report must be signed by a radiologist before it can be printed or exported.',
      }
    }
    return OK
  }

  return OK
}
