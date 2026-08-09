// R2.1 — what the radiologist sees instead of internal status names.
//
// The database has four report states (draft | in_review | finalized | amended)
// plus a separate delivery record. None of those words belong on screen: a
// doctor should read "À relire", not "amended". This module is the single
// mapping between the two vocabularies, so no component invents its own.
//
// Pure — no IO, no i18n. Callers translate the returned key.

import type { ReportStatus } from '@/types/report'

/** The only status vocabulary the product shows. */
export type ReportDisplayStatus =
  | 'draft'            // Brouillon      — being written
  | 'review_required'  // À relire       — needs the radiologist before signing
  | 'signed'           // Signé          — validated by a radiologist
  | 'delivered'        // Envoyé         — signed AND sent to a recipient

export const REPORT_DISPLAY_STATUSES: ReportDisplayStatus[] = [
  'draft',
  'review_required',
  'signed',
  'delivered',
]

/**
 * Resolve what to show for one report.
 *
 * `delivered` is a separate fact (a secure delivery exists), not a report
 * status — a report can only be delivered once signed, so delivery wins.
 * An `amended` report has been re-opened after signing and needs the
 * radiologist again, so it reads as "review required" rather than "signed":
 * showing "Signé" for a report whose signature has been cleared would be a
 * clinically misleading label.
 */
export function reportDisplayStatus(
  status: ReportStatus,
  opts?: { delivered?: boolean },
): ReportDisplayStatus {
  if (opts?.delivered && status === 'finalized') return 'delivered'
  switch (status) {
    case 'finalized': return 'signed'
    case 'in_review': return 'review_required'
    case 'amended':   return 'review_required'
    default:          return 'draft'
  }
}

/**
 * Internal statuses behind a display filter. Used to build the query, so the
 * URL never carries a raw internal status name either.
 */
export function internalStatusesFor(display: ReportDisplayStatus): ReportStatus[] {
  switch (display) {
    case 'draft':           return ['draft']
    case 'review_required': return ['in_review', 'amended']
    case 'signed':          return ['finalized']
    case 'delivered':       return ['finalized']
  }
}

export function isReportDisplayStatus(value: string): value is ReportDisplayStatus {
  return (REPORT_DISPLAY_STATUSES as readonly string[]).includes(value)
}

/** Badge colour for each display status, reusing the shared Badge variants. */
export const displayStatusVariant: Record<
  ReportDisplayStatus,
  'neutral' | 'warning' | 'success' | 'info'
> = {
  draft:           'neutral',
  review_required: 'warning',
  signed:          'success',
  delivered:       'info',
}
