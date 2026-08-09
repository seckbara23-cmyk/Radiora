-- =============================================================================
-- Migration 042: R0.8A — radiologist-only clinical authority
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 041)
--
-- WHY:
--   041 closed the 'printed' bypass and the fail-open role check, but still
--   accepted clinic_admin and super_admin as clinical validators:
--
--       v_role not in ('radiologist', 'clinic_admin', 'super_admin')
--
--   That contradicts the product's authority contract (lib/safety/authority.ts,
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
-- WHAT: replaces the function body only (CREATE OR REPLACE). Migration 041 is
-- left exactly as applied — this supersedes it forward-only. Same trigger, same
-- name, same table. NO historical row is read, rewritten or re-validated: the
-- trigger only ever inspects the transition being attempted right now, so rows
-- that reached their current state under the old rule keep it.
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
  -- clinic_admin and super_admin are deliberately excluded (see header).
  if new.workflow_status in ('validated', 'signed')
     and v_role <> 'radiologist' then
    raise exception
      'Only a radiologist can validate or sign a report (role=%, attempted workflow_status=%).',
      coalesce(nullif(v_role, ''), 'unresolved'), new.workflow_status
      using errcode = '42501';
  end if;

  -- ── Validation before distribution ─────────────────────────────────────────
  -- 'printed' and 'exported' are both terminal distribution steps and both
  -- require a signed predecessor.
  if new.workflow_status = 'printed'
     and v_prev not in ('signed', 'printed', 'exported') then
    raise exception
      'A report must be signed by a radiologist before it can be printed (from %).',
      coalesce(nullif(v_prev, ''), 'new')
      using errcode = '42501';
  end if;

  if new.workflow_status = 'exported'
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

-- ─── Structural self-verification ─────────────────────────────────────────────

do $$
declare
  v_src text;
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'vacation_items_validation_authority'
      and tgrelid = 'public.vacation_items'::regclass
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: vacation_items_validation_authority trigger missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_service_context'
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: is_service_context() missing — apply migration 038 first';
  end if;

  -- The whole point of this migration: no administrative clinical override.
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_vacation_validation_authority';

  if v_src like '%''validated'', ''signed''%' and v_src like '%clinic_admin%' then
    raise exception 'MIGRATION SELF-CHECK FAILED: clinic_admin still accepted as a clinical validator';
  end if;
end;
$$;
