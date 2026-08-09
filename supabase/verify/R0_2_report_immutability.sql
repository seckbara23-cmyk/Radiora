-- =============================================================================
-- R0.2 — finalized-report immutability verification (attack simulation)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor, AFTER applying 038 + 039.
-- One transaction, rolls back — nothing persists.
--
-- Simulates API callers via request.jwt.claims. These DO blocks run as the
-- table owner, so RLS does not apply — which is the point: every PASS below is
-- enforced by the reports_immutability_guard trigger ALONE, proving the
-- boundary holds even for callers RLS would allow (clinic_admin) or any
-- future policy mistake. Expected: 9 PASS notices, zero FAILs, then ROLLBACK.
-- =============================================================================

begin;

-- ── Seed (trusted direct-DB context) ──────────────────────────────────────────
insert into public.clinics (id, name, slug)
values ('b0000000-0000-4000-8000-000000000c01', 'R0.2 Clinic', 'r02-verify-clinic');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('b0000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r02.radiologist@test.local', '', now(), now(), now()),
       ('b0000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r02.cadmin@test.local',      '', now(), now(), now()),
       ('b0000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r02.secretary@test.local',   '', now(), now(), now());

update public.profiles set clinic_id = 'b0000000-0000-4000-8000-000000000c01', role = 'radiologist',  is_active = true where id = 'b0000000-0000-4000-8000-0000000000a1';
update public.profiles set clinic_id = 'b0000000-0000-4000-8000-000000000c01', role = 'clinic_admin', is_active = true where id = 'b0000000-0000-4000-8000-0000000000a2';
update public.profiles set clinic_id = 'b0000000-0000-4000-8000-000000000c01', role = 'secretary',    is_active = true where id = 'b0000000-0000-4000-8000-0000000000a3';

insert into public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex)
values ('b0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000c01', 'R02-MRN-1', 'Test', 'Patient', '1975-06-15', 'male');

insert into public.studies (id, clinic_id, patient_id, accession_number, modality, body_part, study_date, status)
values ('b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-000000000c01', 'b0000000-0000-4000-8000-0000000000b1', 'ACC-R02-VERIFY', 'CT', 'Thorax', current_date, 'pending');

-- One draft report (service context insert — allowed, stays draft).
insert into public.reports (id, clinic_id, study_id, patient_id, author_id, status, findings, impression)
values ('b0000000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-000000000c01',
        'b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1',
        'b0000000-0000-4000-8000-0000000000a1', 'draft',
        'Résultats initiaux signés.', 'Conclusion initiale signée.');

-- ── 1: clinic_admin cannot finalize (DB level) ────────────────────────────────
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  begin
    update public.reports set status = 'finalized'
     where id = 'b0000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: clinic_admin finalized a report at the DB level';
  exception when insufficient_privilege then
    raise notice 'PASS 1: clinic_admin cannot finalize via direct table update';
  end;
end;
$$;

-- ── 2: radiologist CAN finalize; signed_at is system-stamped ──────────────────
do $$
declare v_signed timestamptz;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  update public.reports set status = 'finalized'
   where id = 'b0000000-0000-4000-8000-0000000000e1';
  select signed_at into v_signed from public.reports
   where id = 'b0000000-0000-4000-8000-0000000000e1';
  if v_signed is not null then
    raise notice 'PASS 2: radiologist finalization works; signed_at stamped (%)', v_signed;
  else
    raise exception 'FAIL: finalization did not stamp signed_at';
  end if;
end;
$$;

-- ── 3–5: finalized clinical content is immutable for every API role ───────────
do $$
begin
  -- TEST 3: radiologist (the signer!) cannot edit finalized content directly
  perform set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    update public.reports set findings = 'Contenu falsifié.'
     where id = 'b0000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: radiologist edited finalized content directly';
  exception when insufficient_privilege then
    raise notice 'PASS 3: even the signing radiologist cannot edit finalized content directly';
  end;

  -- TEST 4: clinic_admin cannot edit finalized content (audit C2 scenario)
  perform set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  begin
    update public.reports set structured_data = '{"results":"contenu jamais validé"}'::jsonb
     where id = 'b0000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: clinic_admin rewrote finalized structured_data';
  exception when insufficient_privilege then
    raise notice 'PASS 4: finalized structured_data immutable for clinic_admin';
  end;

  -- TEST 5: signed_at cannot be backdated while finalized
  begin
    update public.reports set signed_at = '2020-01-01T00:00:00Z'
     where id = 'b0000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: signed_at was backdated on a finalized report';
  exception when insufficient_privilege then
    raise notice 'PASS 5: signed_at tampering blocked on finalized reports';
  end;
end;
$$;

-- ── 6: the only exit from finalized is "amended", without content changes ─────
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

  -- 6a: finalized → draft is not a legal transition
  begin
    update public.reports set status = 'draft'
     where id = 'b0000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: finalized report reverted straight to draft';
  exception when insufficient_privilege then
    raise notice 'PASS 6a: finalized → draft blocked (amendment is the only exit)';
  end;

  -- 6b: the amend transition cannot smuggle content edits in the same statement
  begin
    update public.reports set status = 'amended', findings = 'Nouveau contenu glissé.'
     where id = 'b0000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: content change smuggled into the amend transition';
  exception when insufficient_privilege then
    raise notice 'PASS 6b: amend transition with content change blocked';
  end;
end;
$$;

-- ── 7: signed content unchanged after all rejected operations ─────────────────
do $$
declare v_findings text;
begin
  select findings into v_findings from public.reports
   where id = 'b0000000-0000-4000-8000-0000000000e1';
  if v_findings = 'Résultats initiaux signés.' then
    raise notice 'PASS 7: signed content byte-identical after every rejected attack';
  else
    raise exception 'FAIL: signed content drifted to: %', v_findings;
  end if;
end;
$$;

-- ── 8: the legitimate amendment flow still works (pure status transition) ─────
do $$
declare v_status text; v_signed timestamptz;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  update public.reports set status = 'amended'
   where id = 'b0000000-0000-4000-8000-0000000000e1';
  select status::text, signed_at into v_status, v_signed
    from public.reports where id = 'b0000000-0000-4000-8000-0000000000e1';
  if v_status = 'amended' and v_signed is null then
    raise notice 'PASS 8: amendment re-open works; live signed_at cleared (original preserved in report_versions by the app snapshot)';
  else
    raise exception 'FAIL: amend transition state unexpected (status %, signed_at %)', v_status, v_signed;
  end if;
end;
$$;

-- ── 9: report_versions can carry the full signed document (039 columns) ───────
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.report_versions
    (report_id, clinic_id, version_number, findings, impression, recommendations,
     structured_data, signed_at, status, created_by, action, change_reason)
  values
    ('b0000000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-000000000c01',
     999, 'Résultats initiaux signés.', 'Conclusion initiale signée.', null,
     '{"results":"Résultats initiaux signés."}'::jsonb, now(), 'finalized',
     'b0000000-0000-4000-8000-0000000000a1', 'amended', 'R0.2 verification');
  raise notice 'PASS 9: version snapshot stores structured_data + original signed_at';
end;
$$;

rollback;
