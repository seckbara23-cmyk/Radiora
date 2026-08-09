-- =============================================================================
-- Migration 038: R0.1 — profiles privilege-escalation guard
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 037)
--
-- WHY (audit finding C1, confirmed twice):
--   The "profiles: update own" RLS policy (001) authorizes an authenticated
--   user to update ANY column of their own row. Postgres RLS cannot restrict
--   columns, so a logged-in viewer/secretary could call PostgREST directly
--   with the public anon key + their session JWT and set role = 'super_admin'
--   or move themselves into another clinic — dissolving every tenant boundary.
--
-- WHAT:
--   1. public.is_service_context() — shared security primitive that identifies
--      trusted server contexts EXPLICITLY (service_role JWT, or a direct
--      database session with no Supabase JWT at all: SQL editor, migrations,
--      background jobs). Deliberately NOT a bare "auth.uid() IS NULL" check:
--      an anon-key request also has a NULL uid but carries an 'anon' JWT and
--      is NOT trusted.
--   2. A BEFORE UPDATE trigger on public.profiles that rejects any change to
--      the privilege-bearing columns (role, clinic_id, is_active) unless the
--      actor is a trusted server context, a super_admin, or a clinic_admin
--      acting on ANOTHER member of their own clinic within the limits the 003
--      policy already promised (no cross-clinic moves, no super_admin grants,
--      cannot touch a super_admin's row).
--
-- WHAT KEEPS WORKING (verified against the code):
--   • updateMyProfile (lib/actions/profile.ts) — touches only identity /
--     signature columns → guard not triggered.
--   • setUserStatus (lib/actions/users.ts) — clinic_admin toggling is_active
--     of another clinic member via the session client → clinic_admin branch.
--   • inviteUser / onboarding / platform actions — service-role client →
--     trusted context branch.
--   • handle_new_user — INSERT, not UPDATE; the guard only watches UPDATE.
--
-- Forward-only. No existing policy, table, or row is dropped or modified.
-- =============================================================================

-- ── 1. Shared primitive: which contexts are trusted server contexts? ──────────

create or replace function public.is_service_context()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims   text := nullif(current_setting('request.jwt.claims', true), '');
  v_jwt_role text;
begin
  -- No Supabase JWT at all: a direct database session (SQL editor, migration
  -- runner, psql). PostgREST ALWAYS sets request.jwt.claims, so the absence of
  -- claims cannot be an API caller.
  if v_claims is null then
    return true;
  end if;

  begin
    v_jwt_role := coalesce(v_claims::jsonb ->> 'role', '');
  exception when others then
    -- Unparseable claims → treat as an untrusted caller (fail CLOSED).
    return false;
  end;

  -- The two PostgREST-facing roles are the untrusted API surface: 'authenticated'
  -- is the attack vector this migration closes (a real user's session JWT plus
  -- the public anon key), and 'anon' is unauthenticated. EVERY other role
  -- (service_role, postgres, supabase_admin, dashboard sessions) is a trusted
  -- server context.
  return v_jwt_role not in ('authenticated', 'anon');
end;
$$;

comment on function public.is_service_context() is
  'True for trusted server contexts: any caller that is NOT a PostgREST authenticated/anon JWT — i.e. service_role, or a direct DB session (SQL editor / migrations). Fails closed on unparseable claims (R0.1).';

revoke execute on function public.is_service_context() from public, anon;
grant  execute on function public.is_service_context() to authenticated, service_role;

-- ── 2. Privilege guard on profiles ────────────────────────────────────────────

create or replace function public.enforce_profile_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid;
  v_actor_role   text;
  v_actor_clinic uuid;
begin
  -- Only the privilege-bearing columns are guarded; ordinary profile edits
  -- (names, signature, phone, …) pass through untouched.
  if new.role      is not distinct from old.role
     and new.clinic_id is not distinct from old.clinic_id
     and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  -- Trusted server contexts: service-role client, SQL editor, migrations.
  if public.is_service_context() then
    return new;
  end if;

  v_actor := auth.uid();
  if v_actor is null then
    -- An API caller with no user identity (anon key) may never change these.
    raise exception 'profiles.role / clinic_id / is_active cannot be changed by this caller'
      using errcode = '42501';
  end if;

  -- Read the ACTOR''s stored role/clinic. For a self-update this still sees the
  -- pre-update row: a BEFORE trigger runs before the new values are applied.
  select p.role::text, p.clinic_id
    into v_actor_role, v_actor_clinic
    from public.profiles p
   where p.id = v_actor;

  -- Super admins retain full user management (unchanged from the 001 policy).
  if v_actor_role = 'super_admin' then
    return new;
  end if;

  -- Clinic admins manage OTHER members of their own clinic, within the limits
  -- the 003 policy promised: no cross-clinic moves, no super_admin grants,
  -- cannot touch a super_admin, and never their own privilege columns.
  if v_actor_role = 'clinic_admin'
     and old.id is distinct from v_actor
     and old.clinic_id = v_actor_clinic
     and new.clinic_id is not distinct from old.clinic_id
     and old.role::text <> 'super_admin'
     and new.role::text <> 'super_admin' then
    return new;
  end if;

  raise exception 'profiles.role / clinic_id / is_active can only be changed by an authorized administrator'
    using errcode = '42501';
end;
$$;

comment on function public.enforce_profile_privilege_guard() is
  'R0.1 — blocks self-service privilege escalation: role / clinic_id / is_active may only change via trusted server contexts, super_admin, or a clinic_admin acting on another member of their own clinic.';

drop trigger if exists profiles_privilege_guard on public.profiles;

create trigger profiles_privilege_guard
  before update on public.profiles
  for each row execute function public.enforce_profile_privilege_guard();

-- ── 3. Structural self-verification (fails the migration if wiring is off) ────

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_privilege_guard'
      and tgrelid = 'public.profiles'::regclass
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: profiles_privilege_guard trigger missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_service_context'
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: is_service_context() missing';
  end if;
end;
$$;
