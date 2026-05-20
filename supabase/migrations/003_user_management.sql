-- =============================================================================
-- Migration: User management — email on profiles + clinic_admin UPDATE policy
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- What this migration does:
--   1. Adds an `email` column to profiles (denormalized from auth.users so the
--      users list page can display it without a service-role join).
--   2. Backfills existing profile rows with the email from auth.users.
--   3. Updates handle_new_user() to capture email when a new auth user is created.
--   4. Adds an UPDATE policy so clinic_admin can deactivate / reactivate users
--      and change roles within their own clinic (but cannot set super_admin).
-- =============================================================================

-- ── 1. Add email column ───────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists email text;

-- ── 2. Backfill email from auth.users ─────────────────────────────────────────
-- (Runs with the SQL editor's elevated privileges — safe in this context.)

update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and p.email is null;

-- ── 3. Update handle_new_user() to capture email ──────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

-- ── 4. RLS: clinic_admin can update profiles within their own clinic ───────────
--
-- Allows: toggling is_active, changing role (but not to super_admin),
--         updating name, specialty, license_number.
-- Prevents: moving a user to a different clinic, escalating to super_admin.
--
-- Note: super_admin already has unrestricted UPDATE access via the existing
--       "profiles: super_admin all" policy — no change needed there.

drop policy if exists "profiles: clinic_admin update clinic" on public.profiles;

create policy "profiles: clinic_admin update clinic"
  on public.profiles for update
  to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() = 'clinic_admin'
  )
  with check (
    -- After the update, the user must still belong to the same clinic
    clinic_id = public.get_current_user_clinic_id()
    -- clinic_admin cannot set anyone to super_admin
    and role <> 'super_admin'
  );
