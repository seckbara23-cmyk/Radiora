-- =============================================================================
-- Migration 041: R0.7 — close the vacation-queue authority bypass
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 040)
--
-- WHY (audit finding H1):
--   enforce_vacation_validation_authority (017) claimed to make physician
--   validation mandatory before export, but had two holes:
--
--   1. 'printed' was reachable from ANY state — nothing guarded it — while the
--      'exported' check accepted 'printed' as a valid predecessor. A secretary
--      calling PostgREST directly could therefore walk an item
--      audio_received → printed → exported in two updates, with no radiologist
--      ever validating it. The app layer (actions/vacations.ts) does check
--      this, but the migration advertised defence in depth it did not deliver.
--
--   2. The role test read `get_current_user_role() NOT IN (...)`, which
--      evaluates to NULL — not TRUE — when the role cannot be resolved, so the
--      RAISE never fired. That is fail-OPEN on a medical-safety gate. Service
--      contexts were relying on that accident rather than an explicit bypass.
--
-- WHAT: replaces the function body only. Same trigger, same name, same table —
-- no schema, data, policy or workflow state is touched, and every transition
-- the application performs today still succeeds.
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

  -- Trusted server contexts (service-role client, SQL editor, migrations)
  -- bypass EXPLICITLY — never by way of an unresolved role. See migration 038.
  if public.is_service_context() then
    return new;
  end if;

  -- Fail CLOSED: an unresolvable role becomes '' and satisfies no branch below.
  v_role := coalesce(public.get_current_user_role()::text, '');

  -- Only a radiologist / admin may validate or sign. A secretary never can.
  if new.workflow_status in ('validated', 'signed')
     and v_role not in ('radiologist', 'clinic_admin', 'super_admin') then
    raise exception
      'Only a radiologist can validate or sign a report (attempted workflow_status=%).',
      new.workflow_status
      using errcode = '42501';
  end if;

  -- Physician validation is mandatory before the item leaves the clinical
  -- workflow. 'printed' is now guarded on the SAME footing as 'exported' —
  -- it was the open door that made the 'exported' check bypassable.
  if new.workflow_status = 'printed'
     and v_prev not in ('signed', 'printed', 'exported') then
    raise exception
      'A report must be signed by a radiologist before it can be printed (from %).',
      v_prev
      using errcode = '42501';
  end if;

  if new.workflow_status = 'exported'
     and v_prev not in ('signed', 'printed', 'exported') then
    raise exception
      'A report must be signed by a radiologist before it can be exported (from %).',
      v_prev
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_vacation_validation_authority() is
  'R0.7 — physician-validation gate for the vacation queue. printed AND exported both require a signed predecessor; unresolved roles fail closed; service contexts bypass explicitly via is_service_context().';

-- The trigger itself is unchanged (017 created it); re-assert it so this
-- migration is self-contained if the trigger was ever dropped.
drop trigger if exists vacation_items_validation_authority on public.vacation_items;
create trigger vacation_items_validation_authority
  before insert or update on public.vacation_items
  for each row execute function public.enforce_vacation_validation_authority();

-- ─── Structural self-verification ─────────────────────────────────────────────

do $$
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
end;
$$;
