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

export interface ReportWriteCheck {
  allowed: boolean
  reason:  string | null
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
        return { allowed: false, reason: 'Only a radiologist can validate and sign reports.' }
      }
      break
    case 'structuring_accept':
      // Pushing the reviewed structured draft into the clinical report is an
      // editorial act on diagnostic content — the authority contract keeps it
      // radiologist-only (see the module comment in lib/actions/structuring.ts).
      if (!canSignReports(actorRole)) {
        return { allowed: false, reason: 'Only a radiologist can apply the structured report.' }
      }
      break
    case 'draft_save':
    case 'ai_accept':
      if (!canEditClinicalContent(actorRole)) {
        return { allowed: false, reason: 'You do not have permission to edit reports.' }
      }
      break
    case 'amend':
      if (!canEditClinicalContent(actorRole)) {
        return { allowed: false, reason: 'You do not have permission to amend reports.' }
      }
      break
  }

  // ── Status gate ─────────────────────────────────────────────────────────────
  if (currentStatus === null) return OK // role-only pre-check

  if (kind === 'amend') {
    return isReportContentLocked(currentStatus)
      ? OK
      : { allowed: false, reason: 'Only a finalized report can be amended.' }
  }

  if (isReportContentLocked(currentStatus)) {
    return {
      allowed: false,
      reason:
        kind === 'finalize'
          ? 'Report is already finalized.'
          : 'Finalized reports cannot be modified. Use "Amend Report" to re-open the report first.',
    }
  }

  return OK
}
