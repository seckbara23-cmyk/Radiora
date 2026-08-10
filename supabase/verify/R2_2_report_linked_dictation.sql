-- =============================================================================
-- R2.2 — report-linked dictation ownership verification
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor, AFTER applying migration 044.
-- One transaction, ROLLBACK at the end — no fixture survives.
--
-- PRIVACY: never selects or prints a transcript body, a session token, or
-- patient data. Assertions read ids, counts and constraint outcomes only.
--
-- FIXTURE IDS are hexadecimal only (0-9, a-f) — a UUID with 'v'/'i'/'r' in it
-- is rejected by Postgres with 22P02 before any test runs.
--   c1/c2 clinics · a1 radiologist · b1 patient · d1 study
--   f1/f2 reports (f2 = other clinic) · aa1 vacation · e1 queue item
--
-- Expected: 16 PASS notices, zero FAILs, then ROLLBACK.
-- =============================================================================

begin;

-- ─── Seed (no JWT claims yet → trusted direct-DB context) ─────────────────────
insert into public.clinics (id, name, slug) values
  ('a2000000-0000-4000-8000-0000000000c1', 'R2.2 Clinic A', 'r22-verify-clinic-a'),
  ('a2000000-0000-4000-8000-0000000000c2', 'R2.2 Clinic B', 'r22-verify-clinic-b');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('a2000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'r22.radiologist@test.local', '', now(), now(), now());

update public.profiles
   set clinic_id = 'a2000000-0000-4000-8000-0000000000c1', role = 'radiologist', is_active = true
 where id = 'a2000000-0000-4000-8000-0000000000a1';

insert into public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex)
values ('a2000000-0000-4000-8000-0000000000b1', 'a2000000-0000-4000-8000-0000000000c1',
        'R22-MRN-1', 'Test', 'Patient', '1979-05-04', 'male');

insert into public.studies (id, clinic_id, patient_id, accession_number, modality, body_part, study_date, status)
values ('a2000000-0000-4000-8000-0000000000d1', 'a2000000-0000-4000-8000-0000000000c1',
        'a2000000-0000-4000-8000-0000000000b1', 'ACC-R22-VERIFY', 'CT', 'Thorax', current_date, 'pending');

-- Report in clinic A, and a second report in clinic B for the isolation test.
insert into public.reports (id, clinic_id, study_id, patient_id, author_id, status, findings, impression)
values ('a2000000-0000-4000-8000-0000000000f1', 'a2000000-0000-4000-8000-0000000000c1',
        'a2000000-0000-4000-8000-0000000000d1', 'a2000000-0000-4000-8000-0000000000b1',
        'a2000000-0000-4000-8000-0000000000a1', 'draft', '', '');

insert into public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex)
values ('a2000000-0000-4000-8000-0000000000b2', 'a2000000-0000-4000-8000-0000000000c2',
        'R22-MRN-2', 'Other', 'Patient', '1985-02-02', 'female');
insert into public.studies (id, clinic_id, patient_id, accession_number, modality, body_part, study_date, status)
values ('a2000000-0000-4000-8000-0000000000d2', 'a2000000-0000-4000-8000-0000000000c2',
        'a2000000-0000-4000-8000-0000000000b2', 'ACC-R22-OTHER', 'US', 'Abdomen', current_date, 'pending');
insert into public.reports (id, clinic_id, study_id, patient_id, author_id, status, findings, impression)
values ('a2000000-0000-4000-8000-0000000000f2', 'a2000000-0000-4000-8000-0000000000c2',
        'a2000000-0000-4000-8000-0000000000d2', 'a2000000-0000-4000-8000-0000000000b2',
        'a2000000-0000-4000-8000-0000000000a1', 'draft', '', '');

-- Vacation queue fixture (the pre-existing owner kind).
insert into public.vacations (id, clinic_id, title, modality, vacation_date, created_by)
values ('a2000000-0000-4000-8000-000000000aa1', 'a2000000-0000-4000-8000-0000000000c1',
        'R2.2 vacation', 'CT', current_date, 'a2000000-0000-4000-8000-0000000000a1');

insert into public.vacation_items (id, clinic_id, vacation_id, position, workflow_status, created_by)
values ('a2000000-0000-4000-8000-0000000000e1', 'a2000000-0000-4000-8000-0000000000c1',
        'a2000000-0000-4000-8000-000000000aa1', 0, 'audio_received',
        'a2000000-0000-4000-8000-0000000000a1');

-- ─── 1: the existing vacation-owned path still works ──────────────────────────
do $$
begin
  insert into public.dictation_sessions (clinic_id, vacation_item_id, created_by, token, expires_at)
  values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000e1',
          'a2000000-0000-4000-8000-0000000000a1', 'r22-token-queue', now() + interval '30 minutes');

  insert into public.transcriptions (clinic_id, vacation_item_id, created_by)
  values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000e1',
          'a2000000-0000-4000-8000-0000000000a1');

  raise notice 'PASS 1: vacation-owned session and transcription still insert';
end;
$$;

-- ─── 2: report-owned session ──────────────────────────────────────────────────
do $$
begin
  insert into public.dictation_sessions (clinic_id, report_id, created_by, token, expires_at)
  values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000f1',
          'a2000000-0000-4000-8000-0000000000a1', 'r22-token-report', now() + interval '30 minutes');
  raise notice 'PASS 2: report-owned dictation session accepted';
end;
$$;

-- ─── 3: report-owned audio ────────────────────────────────────────────────────
do $$
begin
  insert into public.audio_assets
    (id, clinic_id, report_id, uploaded_by, original_filename, mime_type, storage_path)
  values ('a2000000-0000-4000-8000-00000000ad01', 'a2000000-0000-4000-8000-0000000000c1',
          'a2000000-0000-4000-8000-0000000000f1', 'a2000000-0000-4000-8000-0000000000a1',
          'dictation.webm', 'audio/webm',
          'a2000000-0000-4000-8000-0000000000c1/a2000000-0000-4000-8000-00000000ad01.webm');
  raise notice 'PASS 3: report-owned audio asset accepted';
end;
$$;

-- ─── 4: report-owned transcription ────────────────────────────────────────────
do $$
begin
  insert into public.transcriptions (clinic_id, report_id, created_by)
  values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000f1',
          'a2000000-0000-4000-8000-0000000000a1');
  raise notice 'PASS 4: report-owned transcription accepted';
end;
$$;

-- ─── 5: BOTH owners is rejected ───────────────────────────────────────────────
do $$
begin
  begin
    insert into public.dictation_sessions (clinic_id, vacation_item_id, report_id, created_by, token, expires_at)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000e1',
            'a2000000-0000-4000-8000-0000000000f1', 'a2000000-0000-4000-8000-0000000000a1',
            'r22-token-both', now() + interval '30 minutes');
    raise exception 'FAIL: a session with BOTH owners was accepted';
  exception when check_violation then
    raise notice 'PASS 5a: session with both owners rejected';
  end;

  begin
    insert into public.transcriptions (clinic_id, vacation_item_id, report_id, created_by)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000e1',
            'a2000000-0000-4000-8000-0000000000f1', 'a2000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: a transcription with BOTH owners was accepted';
  exception when check_violation then
    raise notice 'PASS 5b: transcription with both owners rejected';
  end;

  begin
    insert into public.audio_assets
      (clinic_id, vacation_id, report_id, uploaded_by, original_filename, mime_type, storage_path)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-000000000aa1',
            'a2000000-0000-4000-8000-0000000000f1', 'a2000000-0000-4000-8000-0000000000a1',
            'x.webm', 'audio/webm', 'p/x.webm');
    raise exception 'FAIL: an audio asset with BOTH owners was accepted';
  exception when check_violation then
    raise notice 'PASS 5c: audio asset with both owners rejected';
  end;
end;
$$;

-- ─── 6: NEITHER owner is rejected (sessions, transcriptions) ──────────────────
do $$
begin
  begin
    insert into public.dictation_sessions (clinic_id, created_by, token, expires_at)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000a1',
            'r22-token-none', now() + interval '30 minutes');
    raise exception 'FAIL: an ownerless session was accepted';
  exception when check_violation then
    raise notice 'PASS 6a: ownerless session rejected';
  end;

  begin
    insert into public.transcriptions (clinic_id, created_by)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: an ownerless transcription was accepted';
  exception when check_violation then
    raise notice 'PASS 6b: ownerless transcription rejected';
  end;

  -- audio_assets is deliberately NAND, not XOR: batch/long ingestion stores
  -- audio before it is assigned to anything. Unowned audio must still insert.
  insert into public.audio_assets
    (clinic_id, uploaded_by, original_filename, mime_type, storage_path, ingestion_mode)
  values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000a1',
          'batch.mp3', 'audio/mpeg', 'p/batch.mp3', 'batch');
  raise notice 'PASS 6c: unassigned (batch) audio still accepted — by design';
end;
$$;

-- ─── 7: cross-clinic report ownership is rejected ─────────────────────────────
do $$
begin
  -- Clinic A row pointing at clinic B's report. RLS would pass (clinic_id is
  -- the caller's own); the migration-044 trigger is what stops it.
  begin
    insert into public.transcriptions (clinic_id, report_id, created_by)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000f2',
            'a2000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: dictation was attached to another clinic''s report';
  exception when insufficient_privilege then
    raise notice 'PASS 7a: cross-clinic report ownership rejected (transcription)';
  end;

  begin
    insert into public.dictation_sessions (clinic_id, report_id, created_by, token, expires_at)
    values ('a2000000-0000-4000-8000-0000000000c1', 'a2000000-0000-4000-8000-0000000000f2',
            'a2000000-0000-4000-8000-0000000000a1', 'r22-token-cross', now() + interval '30 minutes');
    raise exception 'FAIL: a session was minted for another clinic''s report';
  exception when insufficient_privilege then
    raise notice 'PASS 7b: cross-clinic report session rejected';
  end;
end;
$$;

-- ─── 8: vacation-item ownership remains clinic-safe ───────────────────────────
do $$
declare
  v_other_item uuid := 'a2000000-0000-4000-8000-0000000000e2';
begin
  insert into public.vacations (id, clinic_id, title, modality, vacation_date, created_by)
  values ('a2000000-0000-4000-8000-000000000aa2', 'a2000000-0000-4000-8000-0000000000c2',
          'Other clinic vacation', 'US', current_date, 'a2000000-0000-4000-8000-0000000000a1');
  insert into public.vacation_items (id, clinic_id, vacation_id, position, workflow_status, created_by)
  values (v_other_item, 'a2000000-0000-4000-8000-0000000000c2',
          'a2000000-0000-4000-8000-000000000aa2', 0, 'audio_received',
          'a2000000-0000-4000-8000-0000000000a1');

  begin
    insert into public.transcriptions (clinic_id, vacation_item_id, created_by)
    values ('a2000000-0000-4000-8000-0000000000c1', v_other_item,
            'a2000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: dictation was attached to another clinic''s queue item';
  exception when insufficient_privilege then
    raise notice 'PASS 8: cross-clinic queue-item ownership rejected';
  end;
end;
$$;

-- ─── 9: the report finds its own transcription ────────────────────────────────
do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.transcriptions
   where report_id = 'a2000000-0000-4000-8000-0000000000f1';
  if v_count = 1 then
    raise notice 'PASS 9a: report-owned transcription is discoverable from the report';
  else
    raise exception 'FAIL: expected 1 report-owned transcription, found %', v_count;
  end if;

  -- and the queue lookup is single-valued (vacation_items_report_uidx)
  if exists (select 1 from pg_indexes
              where schemaname='public' and indexname='vacation_items_report_uidx') then
    raise notice 'PASS 9b: vacation_items.report_id is uniquely indexed';
  else
    raise exception 'FAIL: vacation_items_report_uidx missing';
  end if;
end;
$$;

-- ─── 10: no row anywhere violates the ownership rules ─────────────────────────
do $$
declare v_bad bigint;
begin
  select count(*) into v_bad from public.dictation_sessions
   where num_nonnulls(vacation_item_id, report_id) <> 1;
  if v_bad <> 0 then raise exception 'FAIL: % session(s) without exactly one owner', v_bad; end if;

  select count(*) into v_bad from public.transcriptions
   where num_nonnulls(vacation_item_id, report_id) <> 1;
  if v_bad <> 0 then raise exception 'FAIL: % transcription(s) without exactly one owner', v_bad; end if;

  select count(*) into v_bad from public.audio_assets
   where num_nonnulls(vacation_id, report_id) > 1;
  if v_bad <> 0 then raise exception 'FAIL: % audio asset(s) with both owners', v_bad; end if;

  raise notice 'PASS 10: every row satisfies the ownership constraints';
  raise notice 'R2.2 verification complete — rolling back, no fixtures retained.';
end;
$$;

rollback;
