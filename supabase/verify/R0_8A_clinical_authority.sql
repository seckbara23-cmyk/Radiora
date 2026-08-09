-- =============================================================================
-- R0.8A — clinical-authority verification (attack simulation)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor, AFTER applying migration 042.
-- One transaction, ROLLBACK at the end — no fixture survives.
--
-- Callers are simulated by installing request.jwt.claims exactly as PostgREST
-- does. These DO blocks run as the table owner, so RLS does not apply — that is
-- deliberate: every PASS below is enforced by the
-- vacation_items_validation_authority trigger ALONE, proving the boundary holds
-- even for a caller RLS would happily let through (clinic_admin) and for any
-- future policy mistake.
--
-- Expected: 10 PASS notices, zero FAILs, then ROLLBACK.
-- =============================================================================

begin;

-- ── Seed (no claims set yet → trusted direct-DB context) ──────────────────────
insert into public.clinics (id, name, slug)
values ('c0000000-0000-4000-8000-000000000c01', 'R0.8A Clinic', 'r08a-verify-clinic');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('c0000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r08a.radiologist@test.local', '', now(), now(), now()),
       ('c0000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r08a.cadmin@test.local',      '', now(), now(), now()),
       ('c0000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r08a.secretary@test.local',   '', now(), now(), now()),
       ('c0000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r08a.superadmin@test.local',  '', now(), now(), now());

update public.profiles set clinic_id = 'c0000000-0000-4000-8000-000000000c01', role = 'radiologist',  is_active = true where id = 'c0000000-0000-4000-8000-0000000000a1';
update public.profiles set clinic_id = 'c0000000-0000-4000-8000-000000000c01', role = 'clinic_admin', is_active = true where id = 'c0000000-0000-4000-8000-0000000000a2';
update public.profiles set clinic_id = 'c0000000-0000-4000-8000-000000000c01', role = 'secretary',    is_active = true where id = 'c0000000-0000-4000-8000-0000000000a3';
update public.profiles set clinic_id = 'c0000000-0000-4000-8000-000000000c01', role = 'super_admin',  is_active = true where id = 'c0000000-0000-4000-8000-0000000000a4';

insert into public.vacations (id, clinic_id, title, modality, vacation_date, created_by)
values ('c0000000-0000-4000-8000-0000000000v1', 'c0000000-0000-4000-8000-000000000c01',
        'R0.8A vacation', 'CT', current_date, 'c0000000-0000-4000-8000-0000000000a1');

-- One item awaiting the radiologist, seeded via the trusted context.
insert into public.vacation_items (id, clinic_id, vacation_id, position, workflow_status, created_by)
values ('c0000000-0000-4000-8000-0000000000i1', 'c0000000-0000-4000-8000-000000000c01',
        'c0000000-0000-4000-8000-0000000000v1', 0, 'radiologist_review',
        'c0000000-0000-4000-8000-0000000000a1');

-- ── 1–4: who may NOT validate or sign ─────────────────────────────────────────
do $$
declare
  v_item constant uuid := 'c0000000-0000-4000-8000-0000000000i1';
begin
  -- TEST 1 — clinic_admin cannot validate
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  begin
    update public.vacation_items set workflow_status = 'validated' where id = v_item;
    raise exception 'FAIL: clinic_admin validated a queue item';
  exception when insufficient_privilege then
    raise notice 'PASS 1: clinic_admin cannot validate';
  end;

  -- TEST 2 — clinic_admin cannot sign
  begin
    update public.vacation_items set workflow_status = 'signed' where id = v_item;
    raise exception 'FAIL: clinic_admin signed a queue item';
  exception when insufficient_privilege then
    raise notice 'PASS 2: clinic_admin cannot sign';
  end;

  -- TEST 3 — super_admin has NO clinical override
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
  begin
    update public.vacation_items set workflow_status = 'signed' where id = v_item;
    raise exception 'FAIL: super_admin signed a queue item';
  exception when insufficient_privilege then
    raise notice 'PASS 3: super_admin has no clinical override';
  end;

  -- TEST 4 — secretary cannot validate
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
  begin
    update public.vacation_items set workflow_status = 'validated' where id = v_item;
    raise exception 'FAIL: secretary validated a queue item';
  exception when insufficient_privilege then
    raise notice 'PASS 4: secretary cannot validate';
  end;
end;
$$;

-- ── 5: an unresolved role fails CLOSED ────────────────────────────────────────
do $$
begin
  -- An authenticated JWT whose subject has no profile row: the role cannot be
  -- resolved. This must NOT fall through to a permissive default.
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-00000000dead","role":"authenticated"}', true);
  begin
    update public.vacation_items set workflow_status = 'signed'
     where id = 'c0000000-0000-4000-8000-0000000000i1';
    raise exception 'FAIL: an unresolved role was allowed to sign';
  exception when insufficient_privilege then
    raise notice 'PASS 5: unresolved role fails closed';
  end;
end;
$$;

-- ── 6: unsigned → printed and unsigned → exported are rejected ────────────────
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

  begin
    update public.vacation_items set workflow_status = 'printed'
     where id = 'c0000000-0000-4000-8000-0000000000i1';
    raise exception 'FAIL: unsigned item was printed';
  exception when insufficient_privilege then
    raise notice 'PASS 6a: unsigned → printed rejected';
  end;

  begin
    update public.vacation_items set workflow_status = 'exported'
     where id = 'c0000000-0000-4000-8000-0000000000i1';
    raise exception 'FAIL: unsigned item was exported';
  exception when insufficient_privilege then
    raise notice 'PASS 6b: unsigned → exported rejected';
  end;
end;
$$;

-- ── 7–9: the legitimate radiologist path works end to end ─────────────────────
do $$
declare
  v_item constant uuid := 'c0000000-0000-4000-8000-0000000000i1';
  v_status text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

  -- TEST 7 — radiologist validates
  update public.vacation_items set workflow_status = 'validated' where id = v_item;
  select workflow_status::text into v_status from public.vacation_items where id = v_item;
  if v_status = 'validated' then
    raise notice 'PASS 7: radiologist can validate';
  else
    raise exception 'FAIL: radiologist validation did not persist (got %)', v_status;
  end if;

  -- TEST 8 — radiologist signs
  update public.vacation_items set workflow_status = 'signed' where id = v_item;
  select workflow_status::text into v_status from public.vacation_items where id = v_item;
  if v_status = 'signed' then
    raise notice 'PASS 8: radiologist can sign';
  else
    raise exception 'FAIL: radiologist signing did not persist (got %)', v_status;
  end if;

  -- TEST 9 — signed → printed → exported succeeds
  update public.vacation_items set workflow_status = 'printed'  where id = v_item;
  update public.vacation_items set workflow_status = 'exported' where id = v_item;
  select workflow_status::text into v_status from public.vacation_items where id = v_item;
  if v_status = 'exported' then
    raise notice 'PASS 9: signed → printed → exported succeeds';
  else
    raise exception 'FAIL: distribution chain did not complete (got %)', v_status;
  end if;
end;
$$;

-- ── 10: historical rows are not re-validated by the new rule ──────────────────
do $$
declare
  v_status text;
begin
  -- A row that reached 'signed' under the OLD rule must keep its state: the
  -- trigger only inspects the transition being attempted, never existing rows.
  perform set_config('request.jwt.claims', '', true);
  insert into public.vacation_items (id, clinic_id, vacation_id, position, workflow_status, created_by)
  values ('c0000000-0000-4000-8000-0000000000i2', 'c0000000-0000-4000-8000-000000000c01',
          'c0000000-0000-4000-8000-0000000000v1', 1, 'signed',
          'c0000000-0000-4000-8000-0000000000a2');

  -- A clinic_admin touching an unrelated column must not be blocked, and must
  -- not have the row's clinical state re-checked (patient_label is clerical
  -- metadata, not clinical content).
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  update public.vacation_items set patient_label = 'Patient 42'
   where id = 'c0000000-0000-4000-8000-0000000000i2';

  select workflow_status::text into v_status
    from public.vacation_items where id = 'c0000000-0000-4000-8000-0000000000i2';
  if v_status = 'signed' then
    raise notice 'PASS 10: historical rows keep their state; non-clinical edits still work';
  else
    raise exception 'FAIL: historical row was altered (got %)', v_status;
  end if;
end;
$$;

rollback;
