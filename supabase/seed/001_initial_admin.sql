-- =============================================================================
-- Seed: First Clinic + Clinic Admin Profile
-- =============================================================================
--
-- PURPOSE
--   Creates one clinic and promotes an existing Supabase Auth user to the
--   clinic_admin role, linked to that clinic.
--
-- =============================================================================
-- STEP 1 — Create the auth user in Supabase Dashboard
-- =============================================================================
--   Dashboard → Authentication → Users → "Add user" → "Create new user"
--   Enter the admin's email address and a temporary password, then click
--   "Create user".
--
--   ⚠ Do NOT create auth.users rows with raw SQL — always use the dashboard
--     or the Supabase Auth API. The handle_new_user() trigger that auto-creates
--     a profile stub only fires through the official auth path.
--
-- =============================================================================
-- STEP 2 — Copy the auth user's UUID
-- =============================================================================
--   In Dashboard → Authentication → Users, click the user you just created.
--   Copy the UUID shown at the top of the details panel, e.g.:
--     3b7f9a2c-1d4e-4f8b-9c0a-2e5d6f7a8b9c
--
--   Paste it as the value of v_user_uuid below (replace YOUR_AUTH_USER_UUID).
--
-- =============================================================================
-- STEP 3 — Customise the clinic details and names below, then run
-- =============================================================================
--   Dashboard → SQL Editor → paste this file → "Run"
--   After running, the clinic UUID is printed in the output panel.
--
-- =============================================================================
-- HOW TO LOOK UP THE CLINIC UUID LATER
-- =============================================================================
--   SELECT id, name, slug FROM public.clinics ORDER BY created_at DESC LIMIT 5;
--
-- =============================================================================

do $$
declare
  v_user_uuid   uuid := 'a88806bb-cc12-4383-89e6-e4d33e06959e';  -- ← REPLACE with your auth user UUID
  v_clinic_uuid uuid := gen_random_uuid();       --   generated automatically
begin

  -- ── Guard: make sure a profile stub exists for this user ─────────────────
  -- The handle_new_user() trigger creates the stub the moment the auth user
  -- is created in the dashboard, so this should always pass.
  if not exists (select 1 from public.profiles where id = v_user_uuid) then
    raise exception
      E'\n\nNo profile stub found for UUID: %\n\n'
       'Make sure you:\n'
       '  1. Created the auth user in Dashboard → Authentication → Users\n'
       '  2. Copied the correct UUID (not the email, the UUID)\n'
       '  3. Pasted it as the value of v_user_uuid in this script\n',
      v_user_uuid;
  end if;

  -- ── 1. Create the clinic ──────────────────────────────────────────────────
  insert into public.clinics (id, name, slug, city, state, country, status, plan)
  values (
    v_clinic_uuid,
    'My Radiology Clinic',   -- ← change to your clinic name
    'my-radiology-clinic',   -- ← URL-safe slug; must be globally unique across all clinics
    'New York',              -- ← city
    'NY',                    -- ← state / region
    'US',                    -- ← ISO 3166-1 alpha-2 country code
    'active',
    'professional'
  );

  -- ── 2. Promote the profile stub to clinic_admin ───────────────────────────
  -- The stub was created by handle_new_user() with role='viewer' and
  -- clinic_id=null. We UPDATE it here rather than INSERT a duplicate row.
  update public.profiles
  set
    clinic_id  = v_clinic_uuid,
    role       = 'clinic_admin',
    first_name = 'Admin',    -- ← change to the user's real first name
    last_name  = 'User'      -- ← change to the user's real last name
  where id = v_user_uuid;

  -- ── Done ──────────────────────────────────────────────────────────────────
  raise notice '──────────────────────────────────────────────────────';
  raise notice 'Clinic created  → %', v_clinic_uuid;
  raise notice 'User promoted   → %', v_user_uuid;
  raise notice '──────────────────────────────────────────────────────';
  raise notice 'You can now sign in with the clinic_admin account.';

end;
$$;
