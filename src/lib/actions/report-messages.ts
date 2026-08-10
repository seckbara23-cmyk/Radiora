import 'server-only'
import { getTranslations } from 'next-intl/server'
import type { ReportWriteCheck, ReportWriteDenial } from '@/lib/safety/immutability'

// R2.7C(G) — report-workspace action errors, in the doctor's language.
//
// THE PRODUCTION DEFECT
// /fr showed "Only a radiologist can validate and sign reports." — an English
// sentence on a French-first product, next to a French one ("INDICATION
// manquante") produced by the signing gate a few lines away. The AUTHORIZATION
// was correct and stays exactly as it is; only the message was wrong.
//
// The repair keeps the decision and the wording apart. `evaluateReportWrite`
// stays pure, synchronous and locale-free — it is a safety predicate, and a
// safety predicate that needed a request locale to run would be a worse module.
// It now returns a stable `code`; this is the only place a code becomes a
// sentence, and it runs at the action boundary where the request locale exists.
//
// Deliberately bounded to the report workspace. The dictation, transcription
// and admin actions have the same leakage and are NOT repaired here; they are
// enumerated in localization.test.ts so the remaining surface is written down
// rather than assumed absent.

/** Failures the report workspace can show a clinician. */
export type ReportActionError =
  | ReportWriteDenial
  | 'no_permission_create'
  | 'no_permission_edit_report'
  | 'no_permission_amend_report'
  | 'missing_fields'
  | 'missing_report_id'
  | 'report_not_found'
  | 'report_not_finalized'
  | 'amend_reason_required'

const KEY: Record<ReportActionError, string> = {
  radiologist_only_sign:        'radiologistOnlySign',
  radiologist_only_structuring: 'radiologistOnlyStructuring',
  no_permission_edit:           'noPermissionEdit',
  no_permission_amend:          'noPermissionAmend',
  amend_requires_finalized:     'amendRequiresFinalized',
  already_finalized:            'alreadyFinalized',
  finalized_immutable:          'finalizedImmutable',
  no_permission_create:         'noPermissionCreate',
  no_permission_edit_report:    'noPermissionEdit',
  no_permission_amend_report:   'noPermissionAmend',
  missing_fields:               'missingFields',
  missing_report_id:            'missingReportId',
  report_not_found:             'reportNotFound',
  report_not_finalized:         'reportNotFinalized',
  amend_reason_required:        'amendReasonRequired',
}

/** Localize one report-action failure for the current request locale. */
export async function reportError(code: ReportActionError): Promise<string> {
  const t = await getTranslations('reportErrors')
  return t(KEY[code] as Parameters<typeof t>[0])
}

/**
 * Localize a refusal from `evaluateReportWrite`.
 *
 * Falls back to the check's own `reason` if a code is ever missing, so a new
 * denial branch degrades to an untranslated sentence rather than to no
 * explanation at all — the doctor must always be told why they were refused.
 */
export async function reportWriteError(check: ReportWriteCheck): Promise<string> {
  if (check.code) return reportError(check.code)
  return check.reason ?? ''
}
