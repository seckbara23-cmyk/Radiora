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
| 042 | R0.8A | Radiologist-only clinical authority | **Awaiting operator activation** |
| 043 | R0.8B | Database-enforced delivery expiry | **Awaiting operator activation** |

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

Supersedes the authority function forward-only. Migration 041 is left exactly as
applied; 042 replaces the function body with `CREATE OR REPLACE`.

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

Apply in the Supabase SQL editor, in this order, checking the output of each
before continuing:

1. `supabase/migrations/042_clinical_authority.sql`
2. `supabase/migrations/043_delivery_expiry_enforced.sql`

Each migration ends with a self-verification block that raises an exception if
its own wiring is missing, so a failed apply is loud rather than silent. 043
additionally emits pre-flight notices with the **count** of rows to backfill and
the count already outside the new window — counts only, never row contents.

Then run the verification scripts, which are attack simulations wrapped in a
transaction that **rolls back**, leaving no fixtures:

3. `supabase/verify/R0_8A_clinical_authority.sql` — expect 10 `PASS` notices.
4. `supabase/verify/R0_8B_delivery_expiry.sql` — expect 7 `PASS` notices.

Any `FAIL` notice, or an exception whose message begins with
`MIGRATION SELF-CHECK FAILED`, means the control is not in place — stop and
investigate before relying on it.

Earlier slices ship the same way; their scripts remain available and are
unaffected by this activation:

- `supabase/verify/R0_1_profiles_guard.sql` — expect 8 `PASS` notices.
- `supabase/verify/R0_2_report_immutability.sql` — expect 9 `PASS` notices.
