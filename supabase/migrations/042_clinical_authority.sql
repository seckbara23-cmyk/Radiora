-- =============================================================================
-- Migration 042: R0.8A — radiologist-only clinical authority
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 041)
--
-- WHY:
--   041 closed the 'printed' bypass and the fail-open role check, but still
--   accepted clinic_admin and super_admin as clinical validators. That
--   contradicts the product's authority contract (lib/safety/authority.ts,
--   canValidateReports = radiologist ONLY) and matters because the queue's
--   'signed' state is what unlocks distribution: an administrator could push
--   clinical content to print/export without any physician validating it.
--
--   • radiologist  — clinical validation and signing
--   • clinic_admin — ADMINISTRATIVE authority only (users, branding, templates)
--   • super_admin  — PLATFORM authority only (tenants, billing, support)
--   • secretary / technician / viewer — no clinical authority
--
--   There is no administrative clinical override, by design: signing asserts
--   medical authorship, which an administrator cannot give.
--
-- WHAT: replaces the function body only (CREATE OR REPLACE), keeping the exact
-- zero-argument `returns trigger` signature the existing trigger already calls.
-- Migration 041 is left exactly as applied — this supersedes it forward-only.
-- NO historical row is read, rewritten or re-validated: the trigger only ever
-- inspects the transition being attempted right now, so rows that reached their
-- current state under the old rule keep it.
--
-- ── FIX HISTORY ──────────────────────────────────────────────────────────────
-- The first version of this migration rolled back. Its final self-check used a
-- substring test:
--
--     if v_src like '%''validated'', ''signed''%' and v_src like '%clinic_admin%'
--
-- which matched the CORRECT replacement body: that body legitimately contains
-- `in ('validated', 'signed')`, and it mentions clinic_admin in an explanatory
-- comment. The check therefore raised against its own successful replacement,
-- and because the SQL editor runs the batch in one transaction, the
-- CREATE OR REPLACE was rolled back with it — leaving 041's body installed.
--
-- Statement order was never the problem (CREATE OR REPLACE has always preceded
-- the self-check). The fragile substring matching was. It is replaced below by
-- targeted checks that assert the PREDICATE, not incidental words:
--   * the radiologist-only test must be present in the installed body;
--   * the superseded three-role allowlist must be absent;
--   * the function must still be the zero-argument trigger function;
--   * the trigger must be BEFORE INSERT OR UPDATE, FOR EACH ROW.
--
-- SERVICE-CONTEXT BYPASS (retained, deliberately):
--   public.is_service_context() still short-circuits the gate. It is required by
--   exactly one class of caller — trusted server-side code that has already
--   performed its own authority check, plus operator SQL:
--     • the service-role client used by the phone-dictation path
--       (lib/actions/dictation.ts) to advance audio_received → transcribing for
--       a device that holds a capability token but no user session. That path
--       never touches validated/signed/printed/exported.
--     • migrations, backfills and operator queries in the SQL editor, which run
--       with no PostgREST JWT.
--   It is NOT a user-facing escape hatch: is_service_context() returns false for
--   every 'authenticated' and 'anon' JWT (migration 038), so no logged-in user
--   of any role can reach it.
-- =============================================================================

create or replace function public.enforce_vacation_validation_authority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean := (tg_op = 'INSERT')
                       or (new.workflow_status is distinct from old.workflow_status);
  v_role    text;
  v_next    text := coalesce(new.workflow_status::text, '');
  v_prev    text := coalesce(old.workflow_status::text, '');
begin
  if not v_changed then
    return new;
  end if;

  -- Trusted server contexts only (see header). Never reachable from a
  -- user-facing PostgREST request.
  if public.is_service_context() then
    return new;
  end if;

  -- Fail CLOSED: an unresolvable role becomes '' and satisfies no branch below.
  v_role := coalesce(public.get_current_user_role()::text, '');

  -- ── Clinical authority: RADIOLOGIST ONLY ───────────────────────────────────
  -- Every other role, administrative or otherwise, is rejected here.
  if v_next in ('validated', 'signed')
     and v_role <> 'radiologist' then
    raise exception
      'Only a radiologist can validate or sign a report (role=%, attempted workflow_status=%).',
      coalesce(nullif(v_role, ''), 'unresolved'), v_next
      using errcode = '42501';
  end if;

  -- ── Validation before distribution ─────────────────────────────────────────
  -- 'printed' and 'exported' are both terminal distribution steps and both
  -- require a signed predecessor.
  if v_next = 'printed'
     and v_prev not in ('signed', 'printed', 'exported') then
    raise exception
      'A report must be signed by a radiologist before it can be printed (from %).',
      coalesce(nullif(v_prev, ''), 'new')
      using errcode = '42501';
  end if;

  if v_next = 'exported'
     and v_prev not in ('signed', 'printed', 'exported') then
    raise exception
      'A report must be signed by a radiologist before it can be exported (from %).',
      coalesce(nullif(v_prev, ''), 'new')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_vacation_validation_authority() is
  'R0.8A — clinical authority gate for the vacation queue. validated/signed are RADIOLOGIST ONLY (no administrative override); printed AND exported each require a signed predecessor; unresolved roles fail closed; trusted server contexts bypass explicitly via is_service_context().';

-- Re-assert the trigger so this migration is self-contained. Unchanged shape:
-- BEFORE INSERT OR UPDATE, FOR EACH ROW (matches 017/041).
drop trigger if exists vacation_items_validation_authority on public.vacation_items;
create trigger vacation_items_validation_authority
  before insert or update on public.vacation_items
  for each row execute function public.enforce_vacation_validation_authority();

-- ─── Self-verification ────────────────────────────────────────────────────────
-- Asserts the INSTALLED state, not the text of this file. Deliberately free of
-- incidental-substring matching (see FIX HISTORY above).

do $$
declare
  v_src     text;
  v_nargs   int;
  v_tgtype  int;   -- pg_trigger.tgtype is int2; widened so the bit tests below
                   -- resolve against integer literals without ambiguity.
begin
  -- 1. Prerequisite from migration 038.
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'is_service_context'
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: is_service_context() missing — apply migration 038 first';
  end if;

  -- 2. The gate function exists with the exact zero-argument trigger signature
  --    the trigger calls.
  select p.prosrc, p.pronargs
    into v_src, v_nargs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'enforce_vacation_validation_authority'
     and p.pronargs = 0;

  if v_src is null then
    raise exception 'MIGRATION SELF-CHECK FAILED: zero-argument enforce_vacation_validation_authority() not found';
  end if;

  if v_nargs <> 0 then
    raise exception 'MIGRATION SELF-CHECK FAILED: unexpected function signature (% args)', v_nargs;
  end if;

  -- 3. The radiologist-only predicate must be present in the INSTALLED body.
  --    Whitespace-insensitive so reformatting cannot break the check.
  if v_src !~ 'v_role\s*<>\s*''radiologist''' then
    raise exception 'MIGRATION SELF-CHECK FAILED: radiologist-only predicate not found in the installed function body';
  end if;

  -- 4. The superseded three-role allowlist must be GONE. This matches the old
  --    predicate specifically — not the mere appearance of a role name, which
  --    is what made the previous attempt fail against its own correct body.
  if v_src ~* 'not\s+in\s*\(\s*''radiologist''\s*,\s*''clinic_admin''\s*,\s*''super_admin''\s*\)' then
    raise exception 'MIGRATION SELF-CHECK FAILED: the superseded three-role allowlist is still installed';
  end if;

  -- 5. Both distribution states must be guarded.
  if v_src !~ '''printed''' or v_src !~ '''exported''' then
    raise exception 'MIGRATION SELF-CHECK FAILED: distribution guards missing from the installed function body';
  end if;

  -- 6. Trigger wiring: BEFORE (2) + ROW (1) + INSERT (4) + UPDATE (16).
  select t.tgtype::int
    into v_tgtype
    from pg_trigger t
   where t.tgname = 'vacation_items_validation_authority'
     and t.tgrelid = 'public.vacation_items'::regclass
     and not t.tgisinternal;

  if v_tgtype is null then
    raise exception 'MIGRATION SELF-CHECK FAILED: vacation_items_validation_authority trigger missing';
  end if;
  if (v_tgtype & 1) = 0 then
    raise exception 'MIGRATION SELF-CHECK FAILED: trigger is not FOR EACH ROW';
  end if;
  if (v_tgtype & 2) = 0 then
    raise exception 'MIGRATION SELF-CHECK FAILED: trigger is not a BEFORE trigger';
  end if;
  if (v_tgtype & 4) = 0 then
    raise exception 'MIGRATION SELF-CHECK FAILED: trigger does not fire on INSERT';
  end if;
  if (v_tgtype & 16) = 0 then
    raise exception 'MIGRATION SELF-CHECK FAILED: trigger does not fire on UPDATE';
  end if;

  raise notice 'R0.8A: radiologist-only clinical authority installed; trigger BEFORE INSERT OR UPDATE FOR EACH ROW.';
end;
$$;
