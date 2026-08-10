// R0.2 — finalized-report immutability (single source of truth).
//
// A finalized (signed) report is a legal medical document. Its clinical
// content may only change through the explicit amendment workflow: amend
// (re-open with a reason, snapshot first) → edit as draft → re-finalize.
// Every server action that writes report content routes its role + status
// decision through this module so the rules cannot drift apart, mirroring
// how authority.ts centralizes signing permissions. Database-level
// enforcement lives in migration 039 (enforce_report_immutability trigger);
// this is the application half of the same contract.

import { canSignReports, canEditClinicalContent } from '@/lib/safety/authority'
import type { UserRole } from '@/types/user'

export type ReportWriteKind =
  | 'draft_save'         // saveDraftReport — draft/amended content edits
  | 'ai_accept'          // acceptHPDDraft — apply an AI HPD draft to the report
  | 'structuring_accept' // acceptStructuredReport — push reviewed structured draft
  | 'finalize'           // finalizeReport — validate and sign
  | 'amend'              // amendReport — re-open a finalized report

/**
 * R2.7C — a stable, locale-independent identifier for each refusal.
 *
 * `reason` stays exactly as it was: it is the developer-facing explanation and
 * several callers log it. What it must NOT be is the string shown to a French
 * radiologist — production displayed "Only a radiologist can validate and sign
 * reports." on /fr. Server actions now map this code through next-intl and the
 * predicate that produced it is untouched, so localizing the message cannot
 * change who is allowed to sign.
 */
export type ReportWriteDenial =
  | 'radiologist_only_sign'
  | 'radiologist_only_structuring'
  | 'no_permission_edit'
  | 'no_permission_amend'
  | 'amend_requires_finalized'
  | 'already_finalized'
  | 'finalized_immutable'

export interface ReportWriteCheck {
  allowed: boolean
  reason:  string | null
  /** Present whenever `allowed` is false. */
  code?:   ReportWriteDenial
}

/** A report whose clinical content is locked against direct edits. */
export function isReportContentLocked(status: string | null | undefined): boolean {
  return status === 'finalized'
}

const OK: ReportWriteCheck = { allowed: true, reason: null }

/**
 * Evaluate whether `actorRole` may perform `kind` on a report currently in
 * `currentStatus`. Pass `currentStatus: null` when the report has not been
 * loaded yet — only the role gate is evaluated (callers re-evaluate with the
 * real status once the row is read, before any write).
 */
export function evaluateReportWrite(input: {
  kind:          ReportWriteKind
  currentStatus: string | null
  actorRole:     UserRole
}): ReportWriteCheck {
  const { kind, currentStatus, actorRole } = input

  // ── Role gate ───────────────────────────────────────────────────────────────
  switch (kind) {
    case 'finalize':
      if (!canSignReports(actorRole)) {
        return {
          allowed: false,
          code: 'radiologist_only_sign',
          reason: 'Only a radiologist can validate and sign reports.',
        }
      }
      break
    case 'structuring_accept':
      // Pushing the reviewed structured draft into the clinical report is an
      // editorial act on diagnostic content — the authority contract keeps it
      // radiologist-only (see the module comment in lib/actions/structuring.ts).
      if (!canSignReports(actorRole)) {
        return {
          allowed: false,
          code: 'radiologist_only_structuring',
          reason: 'Only a radiologist can apply the structured report.',
        }
      }
      break
    case 'draft_save':
    case 'ai_accept':
      if (!canEditClinicalContent(actorRole)) {
        return {
          allowed: false,
          code: 'no_permission_edit',
          reason: 'You do not have permission to edit reports.',
        }
      }
      break
    case 'amend':
      if (!canEditClinicalContent(actorRole)) {
        return {
          allowed: false,
          code: 'no_permission_amend',
          reason: 'You do not have permission to amend reports.',
        }
      }
      break
  }

  // ── Status gate ─────────────────────────────────────────────────────────────
  if (currentStatus === null) return OK // role-only pre-check

  if (kind === 'amend') {
    return isReportContentLocked(currentStatus)
      ? OK
      : {
          allowed: false,
          code: 'amend_requires_finalized',
          reason: 'Only a finalized report can be amended.',
        }
  }

  if (isReportContentLocked(currentStatus)) {
    return kind === 'finalize'
      ? { allowed: false, code: 'already_finalized', reason: 'Report is already finalized.' }
      : {
          allowed: false,
          code: 'finalized_immutable',
          reason: 'Finalized reports cannot be modified. Use "Amend Report" to re-open the report first.',
        }
  }

  return OK
}
