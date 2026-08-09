-- =============================================================================
-- R0.1 — profiles privilege-guard verification (attack simulation)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor, AFTER applying migration 038.
-- The whole script runs in ONE transaction and ROLLS BACK — nothing persists.
--
-- It simulates real API callers by installing their JWT claims
-- (request.jwt.claims) exactly as PostgREST does, and — for the RLS-inclusive
-- tests — switching to the `authenticated` database role so BOTH layers
-- (policies + trigger) are exercised. Every test RAISEs NOTICE 'PASS …' or
-- aborts the script with an exception starting 'FAIL:'.
-- Expected output: 8 PASS notices, zero FAILs, then ROLLBACK.
-- =============================================================================

begin;

-- ── Seed (trusted direct-DB context: the 038 guard lets this through) ─────────
insert into public.clinics (id, name, slug)
values ('a0000000-0000-4000-8000-000000000c01', 'R0.1 Clinic A', 'r01-verify-clinic-a'),
       ('a0000000-0000-4000-8000-000000000c02', 'R0.1 Clinic B', 'r01-verify-clinic-b');

-- auth.users inserts fire handle_new_user → profile stubs appear.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('a0000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r01.viewer@test.local',      '', now(), now(), now()),
       ('a0000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r01.cadmin@test.local',      '', now(), now(), now()),
       ('a0000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r01.target@test.local',      '', now(), now(), now()),
       ('a0000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r01.otherclinic@test.local', '', now(), now(), now());

update public.profiles set clinic_id = 'a0000000-0000-4000-8000-000000000c01', role = 'viewer',      is_active = true where id = 'a0000000-0000-4000-8000-0000000000a1';
update public.profiles set clinic_id = 'a0000000-0000-4000-8000-000000000c01', role = 'clinic_admin', is_active = true where id = 'a0000000-0000-4000-8000-0000000000a2';
update public.profiles set clinic_id = 'a0000000-0000-4000-8000-000000000c01', role = 'secretary',   is_active = true where id = 'a0000000-0000-4000-8000-0000000000a3';
update public.profiles set clinic_id = 'a0000000-0000-4000-8000-000000000c02', role = 'viewer',      is_active = true where id = 'a0000000-0000-4000-8000-0000000000a4';

-- A patient in clinic B for the tenant-isolation read check.
insert into public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex)
values ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000c02', 'R01-MRN-1', 'Isolée', 'Patiente', '1980-01-01', 'female');

-- ── 1–3: a normal user CANNOT touch their own privilege columns ───────────────
do $$
declare
  v_viewer constant text := 'a0000000-0000-4000-8000-0000000000a1';
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);

  -- TEST 1: self-promotion to super_admin
  begin
    update public.profiles set role = 'super_admin' where id = v_viewer::uuid;
    raise exception 'FAIL: viewer self-promoted to super_admin';
  exception when insufficient_privilege then
    raise notice 'PASS 1: self-promotion to super_admin blocked';
  end;

  -- TEST 2: self-relocation to another clinic
  begin
    update public.profiles set clinic_id = 'a0000000-0000-4000-8000-000000000c02'
     where id = v_viewer::uuid;
    raise exception 'FAIL: viewer moved themselves to another clinic';
  exception when insufficient_privilege then
    raise notice 'PASS 2: cross-clinic self-relocation blocked';
  end;

  -- TEST 3: self is_active flip
  begin
    update public.profiles set is_active = false where id = v_viewer::uuid;
    raise exception 'FAIL: viewer changed their own is_active';
  exception when insufficient_privilege then
    raise notice 'PASS 3: self is_active change blocked';
  end;
end;
$$;

-- ── 4: permitted self-service edits still work (RLS + trigger together) ───────
do $$
declare
  v_viewer constant text := 'a0000000-0000-4000-8000-0000000000a1';
  v_name   text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.profiles
     set first_name = 'Aïssatou', last_name = 'Ndiaye', specialty = 'Manipulatrice'
   where id = v_viewer::uuid;

  reset role;
  select first_name into v_name from public.profiles where id = v_viewer::uuid;
  if v_name = 'Aïssatou' then
    raise notice 'PASS 4: ordinary self-service profile edit still works under RLS + guard';
  else
    raise exception 'FAIL: self-service profile edit did not persist';
  end if;
end;
$$;

-- ── 5–6: the authorized administrative path still works, within limits ────────
do $$
declare
  v_admin  constant text := 'a0000000-0000-4000-8000-0000000000a2';
  v_target constant text := 'a0000000-0000-4000-8000-0000000000a3';
  v_active boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- TEST 5: clinic_admin deactivates + re-roles another member of their clinic
  update public.profiles set is_active = false, role = 'technician'
   where id = v_target::uuid;

  reset role;
  select is_active into v_active from public.profiles where id = v_target::uuid;
  if v_active = false then
    raise notice 'PASS 5: clinic_admin can still manage users inside their clinic';
  else
    raise exception 'FAIL: clinic_admin user management no longer works';
  end if;

  -- TEST 6: …but cannot escalate anyone to super_admin
  begin
    update public.profiles set role = 'super_admin' where id = v_target::uuid;
    raise exception 'FAIL: clinic_admin escalated a user to super_admin';
  exception when insufficient_privilege then
    raise notice 'PASS 6: clinic_admin cannot grant super_admin';
  end;
end;
$$;

-- ── 7: clinic isolation intact (cross-clinic write + read both fail) ──────────
do $$
declare
  v_admin constant text := 'a0000000-0000-4000-8000-0000000000a2'; -- clinic A admin
  v_other constant text := 'a0000000-0000-4000-8000-0000000000a4'; -- clinic B user
  v_count int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Cross-clinic privilege write: blocked by the guard even without RLS
  -- (this DO block runs as the table owner, so ONLY the trigger stands here —
  -- proving the boundary is DB-enforced, not policy-luck).
  begin
    update public.profiles set is_active = false where id = v_other::uuid;
    raise exception 'FAIL: clinic A admin changed a clinic B user';
  exception when insufficient_privilege then
    raise notice 'PASS 7a: cross-clinic privilege change blocked by trigger alone';
  end;

  -- Cross-clinic PHI read: blocked by RLS (unchanged by this migration).
  set local role authenticated;
  select count(*) into v_count from public.patients
   where clinic_id = 'a0000000-0000-4000-8000-000000000c02';
  reset role;
  if v_count = 0 then
    raise notice 'PASS 7b: clinic A admin cannot read clinic B patients (RLS intact)';
  else
    raise exception 'FAIL: cross-clinic patient rows visible (%)', v_count;
  end if;
end;
$$;

-- ── 8: explicit service context is still allowed (onboarding / invites) ───────
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set role = 'radiologist'
   where id = 'a0000000-0000-4000-8000-0000000000a3';
  raise notice 'PASS 8: service-role context can still provision roles (invite/onboarding path)';
end;
$$;

rollback;
