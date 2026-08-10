# R0 Safety Lockdown — activation log

Operational record of the R0 safety slices: which database migrations have been
applied to production, what was confirmed by schema inspection afterwards, and
what is still awaiting operator activation.

Migrations in this project are applied **manually** in the Supabase SQL editor,
in numeric order. Application code for a slice can be deployed before its
migration is applied — in that state only the application half of the control is
live, so the entries below matter.

This file contains no identifiers, credentials, connection details, screenshots
or patient information.

---

## Status summary

| Migration | Slice | Purpose | State |
| --- | --- | --- | --- |
| 022–036 | F10 → Phase 5 | Prior feature migrations | **Applied** |
| 037 | Pilot feedback | `pilot_feedback` table | **Applied** |
| 038 | R0.1 | `profiles` privilege guard + `is_service_context()` | **Applied** |
| 039 | R0.2 | Finalized-report immutability; version snapshot columns | **Applied** |
| 040 | R0.5 | Delivery lockout columns; restricted delivery policies | **Applied** |
| 041 | R0.7 | Vacation authority: `printed` guard, fail-closed role check | **Applied** |
| 042 | R0.8A | Radiologist-only clinical authority | **Applied** (succeeded on re-run) |
| 043 | R0.8B | Database-enforced delivery expiry | **Applied** |
| 044 | R2.2 | Report-linked dictation ownership | **Awaiting operator activation** |

**Next operator action:** run `supabase/verify/R0_8A_clinical_authority.sql`
(expect 11 `PASS` notices, zero `FAIL`). Migration 043 must not be run until it
passes.

---

## Applied — confirmed by schema inspection

### Migration 040 — delivery hardening (R0.5)

Applied successfully. Production inspection confirmed:

- `report_deliveries.failed_attempts` — present.
- `report_deliveries.locked_until` — present.
- `report_deliveries` policies restricted: read access to a clinic's deliveries
  is limited to the roles that may already issue or revoke them, rather than
  every clinic member.

These back the public delivery gate's durable brute-force lockout. The counters
live on the row rather than in process memory because the application runs
serverless, where an in-memory limiter resets on every cold start and is not
shared between instances.

### Migration 041 — vacation authority (R0.7)

Applied successfully. Production inspection confirmed:

- The vacation authority function and its trigger were replaced.
- The trigger is registered for **both INSERT and UPDATE** on the queue-item
  table, so a row cannot be created directly in a protected state.

---

## Awaiting operator activation

### Migration 042 — radiologist-only clinical authority (R0.8A)

> **Applied on re-run.** The first attempt rolled back; the file was corrected
> and re-applied successfully. Retained here as a record of the failure mode.
>
> Production inspection after the failed attempt showed the authority function still
> carrying the 041 three-role predicate, with the trigger wiring correct and a
> single zero-argument signature present. Cause: the migration's own final
> self-check used a substring test that matched its own *correct* replacement
> body — that body legitimately contains `in ('validated', 'signed')` and
> mentioned `clinic_admin` in an explanatory comment. The check raised, and
> because the SQL editor runs the batch as one transaction, the
> `CREATE OR REPLACE` was rolled back with it.
>
> Statement order was never at fault: `CREATE OR REPLACE FUNCTION` has always
> preceded the self-check. The corrected file replaces the substring matching
> with targeted assertions on the installed state — the radiologist-only
> predicate must be present, the superseded three-role allowlist must be absent,
> the zero-argument trigger signature must be intact, and the trigger must be
> `BEFORE INSERT OR UPDATE ... FOR EACH ROW`. Nothing else about the migration
> changed, and no database object was left modified by the failed attempt.

Supersedes the authority function forward-only. Migration 041 is left exactly as
applied; 042 replaces the function body with `CREATE OR REPLACE`, keeping the
exact zero-argument signature the existing trigger calls.

What changes: `validated` and `signed` become **radiologist only**. The previous
function also accepted `clinic_admin` and `super_admin`, which contradicted the
application's authority contract and mattered because the queue's `signed` state
is what unlocks distribution — an administrator could push clinical content to
print or export with no physician validation.

- `radiologist` — clinical validation and signing.
- `clinic_admin` — administrative authority only.
- `super_admin` — platform authority only.
- `secretary`, `technician`, `viewer` — no clinical authority.
- Unresolved role — fails closed.
- `printed` and `exported` each require a signed predecessor.

No historical row is read, rewritten or re-validated: the trigger only inspects
the transition being attempted, so rows that reached their current state under
the previous rule keep it.

**Service-context bypass (retained, deliberate).** `is_service_context()` still
short-circuits the gate. It is required by trusted server-side code that has
already performed its own authority check — specifically the service-role client
used by the phone-dictation path to advance a device-uploaded item out of
`audio_received`, which never touches the protected states — and by operator SQL
run in the editor with no request JWT. It is not a user-facing escape hatch: the
function returns false for every `authenticated` and `anon` request, so no
logged-in user of any role can reach it.

### Migration 043 — database-enforced delivery expiry (R0.8B)

The application has capped delivery lifetimes since R0.5, but schema inspection
confirmed the column still permits `NULL`, so a direct SQL or PostgREST write
could still create a link to a patient's report that never expires.

What changes:

1. Existing `NULL` expiries are backfilled (policy below).
2. `expires_at` becomes `NOT NULL`.
3. `CHECK report_deliveries_expiry_window` enforces
   `expires_at > created_at` and `expires_at <= created_at + 90 days`.

**Backfill policy — conservative; legacy links are not given a new lifetime.**
For each row with a `NULL` expiry, expiry becomes the earlier of
`created_at + 30 days` and the migration execution time. Every such row predates
the migration, so in practice they land on execution time and are already expired
when the migration commits — a legacy link stops working rather than quietly
gaining another month. If that value would not be strictly later than
`created_at`, the row receives the minimum valid timestamp and is revoked
immediately, since a link that cannot be given a meaningful lifetime must not
stay openable. Rows already revoked keep their original revocation timestamp.

Two follow-up statements bring any pre-existing out-of-window row inside the
constraint: an expiry beyond 90 days is clamped down to the maximum (this can
only shorten a link, never extend one), and an expiry at or before creation is
set to the minimum valid value and revoked. Nothing is deleted.

RLS is untouched — the migration adds no policy and drops none, so the restricted
delivery policies from 040 remain as applied. No token, password hash or
recipient value is read, written or logged.

---

## Activation procedure

Run these in the Supabase SQL editor **strictly in order**, checking the output
of each step before starting the next. Do not batch them together.

**Step 1 — apply the authority migration. ✅ DONE.**
`supabase/migrations/042_clinical_authority.sql` — applied successfully.
Re-running is safe if ever needed: the migration is idempotent
(`CREATE OR REPLACE` plus `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER`) and
touches no row data.

**Step 2 — verify the authority gate. ← NEXT**
`supabase/verify/R0_8A_clinical_authority.sql` — expect **11 `PASS` notices**,
numbered 1 to 11, and zero `FAIL`. It is an attack simulation wrapped in a
transaction that **rolls back**, so it leaves no fixtures behind.

> An earlier revision of this script aborted during fixture setup with
> `22P02: invalid input syntax for type uuid`. Three synthetic ids used
> mnemonic suffixes (`v1` for the vacation, `i1`/`i2` for queue items) and
> `v`/`i` are not hexadecimal, so Postgres rejected the seed before any
> authority test ran. The ids are now hex (`b1`, `e1`, `e2`) and every UUID
> literal in every verification script has been statically validated. No test
> was weakened or removed.

**Stop here if step 2 did not pass.** Migration 043 must not be run
until the authority gate is confirmed installed: the two are independent
controls, and applying the delivery-expiry constraint while the authority gate
is still open would leave the more serious clinical gap unaddressed while
implying the R0.8 slice is complete.

**Step 3 — only after step 2 passes — apply the delivery-expiry migration.**
`supabase/migrations/043_delivery_expiry_enforced.sql`

It emits pre-flight notices with the **count** of rows to backfill and the count
already outside the new window (counts only, never row contents), then enforces
`NOT NULL` and the window constraint.

**Step 4 — verify the expiry constraint.**
`supabase/verify/R0_8B_delivery_expiry.sql` — expect **7 `PASS` notices**; also
transaction-wrapped and rolled back.

Any `FAIL` notice, or an exception whose message begins with
`MIGRATION SELF-CHECK FAILED`, means the control is not in place — stop and
investigate before relying on it. A self-check exception rolls back the whole
migration, so the database is left in its previous state rather than half-applied.

Earlier slices ship the same way; their scripts remain available and are
unaffected by this activation:

- `supabase/verify/R0_1_profiles_guard.sql` — expect 8 `PASS` notices.
- `supabase/verify/R0_2_report_immutability.sql` — expect 9 `PASS` notices.

Every UUID literal in all verification scripts is statically validated as
hexadecimal before release, so a fixture can no longer abort a run the way the
R0_8A seed did.

---

## Migration 044 — report-linked dictation (R2.2) — AWAITING ACTIVATION

**Not applied.** Ships with the R2.2 code deployment; the application keeps
working without it because every report-owned path is new — no existing call
site depends on the new columns.

What it does: lets a dictation session, audio asset and transcript be owned by a
**report** as well as by a vacation queue item, so a report created directly
from a study can start QR dictation and keep its AI review metadata across a
reload. `dictation_sessions` and `transcriptions` get `report_id` and their
`vacation_item_id` relaxed to nullable, each with an exactly-one-owner CHECK;
`audio_assets` gets `report_id` with a never-both CHECK (both NULL stays legal —
batch ingestion stores audio before assignment). A trigger validates that a
dictation row and its owner belong to the same clinic, which RLS alone cannot
express. `vacation_items` gains `UNIQUE (report_id) WHERE report_id IS NOT NULL`.

**No RLS policy is added, widened or dropped. No row is rewritten and no
historical ownership is reassigned.**

### Activation procedure

Run in the Supabase SQL editor, in order:

1. `supabase/migrations/044_report_linked_dictation.sql`

   It **pre-flights first** and aborts loudly rather than constraining bad data:
   it counts sessions/transcriptions lacking a queue owner (must be zero, since
   both columns are `NOT NULL` today) and reports linked to more than one queue
   item (must be zero before `UNIQUE (report_id)` can be created). If either is
   non-zero the migration raises `MIGRATION 044 ABORTED` and changes nothing.

   Success prints:
   `R2.2: report-linked dictation ownership installed; all rows satisfy the constraints.`

2. `supabase/verify/R2_2_report_linked_dictation.sql` — expect **16 `PASS`
   notices**, zero `FAIL`. Transaction-wrapped and rolled back; no fixture
   persists, and it prints no transcript body, token or patient data.

Until step 1 is applied, report-owned dictation returns a database error if
attempted; the vacation-queue workflow is unaffected either way.
