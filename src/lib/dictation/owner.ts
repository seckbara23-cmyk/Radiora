// R2.2 — who owns a dictation session, audio asset or transcript.
//
// One discriminated union instead of optional reportId/vacationItemId travelling
// independently through the call stack. "Exactly one owner" is then a property
// the type system carries, not a convention every call site has to remember —
// and it mirrors the database constraints added in migration 044:
//
//   dictation_sessions : vacation_item_id XOR report_id
//   transcriptions     : vacation_item_id XOR report_id
//   audio_assets       : vacation_id      NAND report_id  (both NULL is legal —
//                        batch/long ingestion stores audio before assignment)
//
// Pure: no IO, no Supabase, no clock.

export type DictationOwnerKind = 'report' | 'vacation_item'

export type DictationOwner =
  | { kind: 'report'; reportId: string }
  | { kind: 'vacation_item'; vacationItemId: string }

// ─── Construction ─────────────────────────────────────────────────────────────

export function reportOwner(reportId: string): DictationOwner {
  return { kind: 'report', reportId }
}

export function vacationItemOwner(vacationItemId: string): DictationOwner {
  return { kind: 'vacation_item', vacationItemId }
}

/**
 * Build an owner from loose values (a form, a query string, a stored row).
 * Returns null when the input does not describe exactly one owner — the caller
 * must treat that as an error rather than guessing.
 */
export function parseDictationOwner(input: {
  reportId?: string | null
  vacationItemId?: string | null
}): DictationOwner | null {
  const reportId = (input.reportId ?? '').trim()
  const itemId = (input.vacationItemId ?? '').trim()
  if (reportId && itemId) return null // both — ambiguous
  if (reportId) return reportOwner(reportId)
  if (itemId) return vacationItemOwner(itemId)
  return null // neither
}

/** True when the pair describes exactly one owner. */
export function hasExactlyOneOwner(input: {
  reportId?: string | null
  vacationItemId?: string | null
}): boolean {
  return parseDictationOwner(input) !== null
}

// ─── Access ───────────────────────────────────────────────────────────────────

/** The owning row's id, whatever kind it is. */
export function ownerId(owner: DictationOwner): string {
  return owner.kind === 'report' ? owner.reportId : owner.vacationItemId
}

export function isReportOwned(owner: DictationOwner): owner is { kind: 'report'; reportId: string } {
  return owner.kind === 'report'
}

// ─── Database payloads ────────────────────────────────────────────────────────

/**
 * Owner columns for `dictation_sessions` and `transcriptions`, which take
 * `vacation_item_id`. Always sets both keys — one to null — so an UPDATE can
 * never leave a stale second owner behind.
 */
export function ownerColumns(owner: DictationOwner): {
  report_id: string | null
  vacation_item_id: string | null
} {
  return owner.kind === 'report'
    ? { report_id: owner.reportId, vacation_item_id: null }
    : { report_id: null, vacation_item_id: owner.vacationItemId }
}

/**
 * Owner columns for `audio_assets`, whose queue link is `vacation_id` (the
 * vacation session), not the item. A queue-owned asset is additionally attached
 * to its item through vacation_items.audio_asset_id, exactly as before.
 */
export function audioOwnerColumns(
  owner: DictationOwner,
  opts?: { vacationId?: string | null },
): { report_id: string | null; vacation_id: string | null } {
  return owner.kind === 'report'
    ? { report_id: owner.reportId, vacation_id: null }
    : { report_id: null, vacation_id: opts?.vacationId ?? null }
}

/** Column/value pair for filtering an existing row by its owner. */
export function ownerFilter(owner: DictationOwner): { column: 'report_id' | 'vacation_item_id'; value: string } {
  return owner.kind === 'report'
    ? { column: 'report_id', value: owner.reportId }
    : { column: 'vacation_item_id', value: owner.vacationItemId }
}

// ─── Navigation and audit ─────────────────────────────────────────────────────

/** Where the user goes back to after working on this owner (locale-stripped). */
export function ownerReturnPath(owner: DictationOwner): string {
  return owner.kind === 'report'
    ? `/reports/${owner.reportId}`
    : `/vacations/items/${owner.vacationItemId}`
}

/**
 * Audit metadata for an owner. Identifies the owner kind and id ONLY — never
 * transcript content, never a session token.
 */
export function ownerAuditMetadata(owner: DictationOwner): {
  ownerKind: DictationOwnerKind
  ownerId: string
} {
  return { ownerKind: owner.kind, ownerId: ownerId(owner) }
}

/** Read an owner back off a persisted row. Null when the row is malformed. */
export function ownerFromRow(row: {
  report_id?: string | null
  vacation_item_id?: string | null
}): DictationOwner | null {
  return parseDictationOwner({
    reportId: row.report_id ?? null,
    vacationItemId: row.vacation_item_id ?? null,
  })
}
