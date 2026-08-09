-- =============================================================================
-- R0.8B — delivery-expiry constraint verification
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor, AFTER applying migration 043.
-- One transaction, ROLLBACK at the end — no fixture survives.
--
-- PRIVACY: this script never selects, prints or asserts on token, password_hash,
-- recipient_label, pdf_path or docx_path. It inserts a placeholder token that is
-- not a real secret and only ever reads back timestamps and counts.
--
-- Expected: 7 PASS notices, zero FAILs, then ROLLBACK.
-- =============================================================================

begin;

-- ── Seed ──────────────────────────────────────────────────────────────────────
insert into public.clinics (id, name, slug)
values ('e0000000-0000-4000-8000-000000000c01', 'R0.8B Clinic', 'r08b-verify-clinic');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('e0000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r08b.radiologist@test.local', '', now(), now(), now());

update public.profiles set clinic_id = 'e0000000-0000-4000-8000-000000000c01', role = 'radiologist', is_active = true
 where id = 'e0000000-0000-4000-8000-0000000000a1';

insert into public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex)
values ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-000000000c01', 'R08B-MRN-1', 'Test', 'Patient', '1980-03-02', 'female');

insert into public.studies (id, clinic_id, patient_id, accession_number, modality, body_part, study_date, status)
values ('e0000000-0000-4000-8000-0000000000d1', 'e0000000-0000-4000-8000-000000000c01', 'e0000000-0000-4000-8000-0000000000b1', 'ACC-R08B-VERIFY', 'US', 'Abdomen', current_date, 'pending');

insert into public.reports (id, clinic_id, study_id, patient_id, author_id, status, findings, impression)
values ('e0000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-000000000c01',
        'e0000000-0000-4000-8000-0000000000d1', 'e0000000-0000-4000-8000-0000000000b1',
        'e0000000-0000-4000-8000-0000000000a1', 'draft', 'Résultats.', 'Conclusion.');

-- Placeholder, NOT a real secret — the constraint under test ignores it entirely.
create temporary view r08b_base as
  select 'e0000000-0000-4000-8000-000000000c01'::uuid as clinic_id,
         'e0000000-0000-4000-8000-0000000000f1'::uuid as report_id,
         'link'::text                                  as channel,
         'r08b-placeholder-not-a-secret'::text         as token;

-- ── 1: NULL expiry is refused ─────────────────────────────────────────────────
do $$
begin
  begin
    insert into public.report_deliveries (clinic_id, report_id, channel, token, password_kind, expires_at)
    select clinic_id, report_id, channel, token || '-null', 'none', null from r08b_base;
    raise exception 'FAIL: a delivery with NULL expiry was accepted';
  exception when not_null_violation then
    raise notice 'PASS 1: NULL expiry rejected (NOT NULL)';
  end;
end;
$$;

-- ── 2: expiry equal to creation is refused ────────────────────────────────────
do $$
declare v_now constant timestamptz := now();
begin
  begin
    insert into public.report_deliveries (clinic_id, report_id, channel, token, password_kind, created_at, expires_at)
    select clinic_id, report_id, channel, token || '-eq', 'none', v_now, v_now from r08b_base;
    raise exception 'FAIL: expiry equal to created_at was accepted';
  exception when check_violation then
    raise notice 'PASS 2: expires_at = created_at rejected';
  end;
end;
$$;

-- ── 3: expiry BEFORE creation is refused ──────────────────────────────────────
do $$
declare v_now constant timestamptz := now();
begin
  begin
    insert into public.report_deliveries (clinic_id, report_id, channel, token, password_kind, created_at, expires_at)
    select clinic_id, report_id, channel, token || '-past', 'none', v_now, v_now - interval '1 day' from r08b_base;
    raise exception 'FAIL: expiry before created_at was accepted';
  exception when check_violation then
    raise notice 'PASS 3: expires_at < created_at rejected';
  end;
end;
$$;

-- ── 4: expiry beyond 90 days is refused ───────────────────────────────────────
do $$
declare v_now constant timestamptz := now();
begin
  begin
    insert into public.report_deliveries (clinic_id, report_id, channel, token, password_kind, created_at, expires_at)
    select clinic_id, report_id, channel, token || '-far', 'none', v_now, v_now + interval '91 days' from r08b_base;
    raise exception 'FAIL: expiry beyond 90 days was accepted';
  exception when check_violation then
    raise notice 'PASS 4: expires_at > created_at + 90 days rejected';
  end;
end;
$$;

-- ── 5: a valid expiry succeeds (30-day application default) ───────────────────
do $$
declare
  v_now constant timestamptz := now();
  v_id  uuid;
  v_days numeric;
begin
  insert into public.report_deliveries (clinic_id, report_id, channel, token, password_kind, created_at, expires_at)
  select clinic_id, report_id, channel, token || '-ok', 'none', v_now, v_now + interval '30 days' from r08b_base
  returning id into v_id;

  select extract(epoch from (expires_at - created_at)) / 86400
    into v_days
    from public.report_deliveries where id = v_id;

  if round(v_days) = 30 then
    raise notice 'PASS 5: a 30-day delivery is accepted and stored intact';
  else
    raise exception 'FAIL: stored lifetime was % days', round(v_days);
  end if;
end;
$$;

-- ── 6: the 90-day boundary itself is allowed ──────────────────────────────────
do $$
declare v_now constant timestamptz := now();
begin
  insert into public.report_deliveries (clinic_id, report_id, channel, token, password_kind, created_at, expires_at)
  select clinic_id, report_id, channel, token || '-max', 'none', v_now, v_now + interval '90 days' from r08b_base;
  raise notice 'PASS 6: the 90-day maximum is inclusive';
end;
$$;

-- ── 7: an UPDATE cannot remove the expiry either ──────────────────────────────
do $$
declare v_id uuid;
begin
  select id into v_id from public.report_deliveries
   where clinic_id = 'e0000000-0000-4000-8000-000000000c01'
   order by created_at limit 1;

  begin
    update public.report_deliveries set expires_at = null where id = v_id;
    raise exception 'FAIL: an UPDATE removed the expiry';
  exception when not_null_violation then
    raise notice 'PASS 7: expiry cannot be nulled by a later UPDATE';
  end;
end;
$$;

-- ── Constraint presence (no row data read) ────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'report_deliveries_expiry_window'
      and conrelid = 'public.report_deliveries'::regclass
  ) then
    raise exception 'FAIL: report_deliveries_expiry_window constraint is missing';
  end if;
  raise notice 'R0.8B verification complete — rolling back, no fixtures retained.';
end;
$$;

rollback;
