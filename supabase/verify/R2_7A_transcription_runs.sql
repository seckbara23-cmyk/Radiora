-- R2_7A_transcription_runs.sql
-- Verification for migration 045 (automatic speech-to-text).
--
-- Read-only with respect to real data: every fixture is created inside the
-- transaction and the whole script ROLLS BACK at the end. Nothing here prints
-- clinical text, a transcript, a patient identifier, a token or a provider key.
--
-- FIXTURES FOLLOW THE PROVEN PATTERN in R2_2_report_linked_dictation.sql:
--   clinic(+slug) → synthetic auth user → profile → patient → study → report
--   → audio asset → transcription
--
-- Every fixture is SYNTHETIC. In particular the script creates its own
-- auth.users row rather than borrowing an existing one: an earlier revision did
-- `SELECT id FROM auth.users LIMIT 1`, which reaches into a real account and
-- also gives no guarantee that the profile belongs to the fixture clinic.
--
-- Fixture UUIDs use hex-only segments. 'v', 'i', 's' and similar letters are
-- NOT valid hex and produce a 22P02 invalid-input error before any test runs —
-- the mistake that aborted the R0.8A verification run. Allowed: 0-9 a-f.
--
--   clinic ceee…   user 0b0b…   patient bbbb…   study 57d7…
--   report 4eef…   asset a55e…
--
-- Run in the Supabase SQL editor. Every check raises NOTICE 'PASS' or fails
-- loudly with an exception.

BEGIN;

DO $$
DECLARE
  v_clinic     uuid := 'ceee0000-0000-4000-8000-000000000001';
  v_clinic_b   uuid := 'ceee0000-0000-4000-8000-000000000002';
  v_user       uuid := '0b0b0000-0000-4000-8000-000000000001';
  v_patient    uuid := 'bbbb0000-0000-4000-8000-000000000001';
  v_study      uuid := '57d70000-0000-4000-8000-000000000001';
  v_report     uuid := '4eef0000-0000-4000-8000-000000000001';
  v_transcript uuid;
  v_asset      uuid := 'a55e0000-0000-4000-8000-000000000001';
  v_run_a      uuid;
  v_n          integer;
  v_failed     boolean;
  v_test       integer := 0;
BEGIN
  -- ── 1. The table, the claim index and the guards exist ─────────────────────
  v_test := v_test + 1;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transcription_runs'
  ) THEN
    RAISE EXCEPTION 'TEST %: transcription_runs table is missing', v_test;
  END IF;
  RAISE NOTICE 'PASS %: transcription_runs exists', v_test;

  v_test := v_test + 1;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'transcription_runs_active_uidx'
  ) THEN
    RAISE EXCEPTION 'TEST %: the claim index is missing', v_test;
  END IF;
  RAISE NOTICE 'PASS %: claim index present', v_test;

  v_test := v_test + 1;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'transcription_runs_clinic_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'TEST %: clinic guard trigger is missing', v_test;
  END IF;
  RAISE NOTICE 'PASS %: clinic guard trigger present', v_test;

  v_test := v_test + 1;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.transcription_runs'::regclass) THEN
    RAISE EXCEPTION 'TEST %: RLS is not enabled on transcription_runs', v_test;
  END IF;
  RAISE NOTICE 'PASS %: RLS enabled', v_test;

  -- ── 2. Migrations 001-044 were not altered ─────────────────────────────────
  v_test := v_test + 1;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transcriptions' AND column_name = 'raw_text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transcriptions' AND column_name = 'report_id'
  ) THEN
    RAISE EXCEPTION 'TEST %: transcriptions lost a pre-existing column', v_test;
  END IF;
  RAISE NOTICE 'PASS %: transcriptions schema intact', v_test;

  v_test := v_test + 1;
  SELECT count(*) INTO v_n
  FROM unnest(enum_range(NULL::public.transcription_status)) AS s;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST %: transcription_status enum was modified (% values, expected 3)', v_test, v_n;
  END IF;
  RAISE NOTICE 'PASS %: review-status enum untouched', v_test;

  -- ── Fixtures ───────────────────────────────────────────────────────────────
  -- clinics.slug is NOT NULL UNIQUE (migration 001). The only other columns
  -- without defaults is `name`; everything else (country/status/plan) defaults.
  INSERT INTO public.clinics (id, name, slug) VALUES
    (v_clinic,   'R2.7A Verify A', 'r27a-verify-clinic-a'),
    (v_clinic_b, 'R2.7A Verify B', 'r27a-verify-clinic-b');

  -- A synthetic user. The AFTER INSERT trigger on auth.users creates the
  -- matching public.profiles row, which reports.author_id references.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'r27a.verify@test.local', '',
    now(), now(), now()
  );

  UPDATE public.profiles
     SET clinic_id = v_clinic, role = 'radiologist'
   WHERE id = v_user;

  -- reports.study_id and reports.patient_id are NOT NULL, so both parents are
  -- required before a report can exist.
  INSERT INTO public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex)
  VALUES (v_patient, v_clinic, 'R27A-MRN-1', 'Test', 'Fixture', '1980-01-01', 'unknown');

  INSERT INTO public.studies (
    id, clinic_id, patient_id, accession_number, modality, body_part, study_date, status
  ) VALUES (
    v_study, v_clinic, v_patient, 'ACC-R27A-VERIFY', 'CT', 'Thorax', current_date, 'pending'
  );

  -- reports has author_id (→ public.profiles), NOT created_by.
  INSERT INTO public.reports (
    id, clinic_id, study_id, patient_id, author_id, status, findings, impression
  ) VALUES (
    v_report, v_clinic, v_study, v_patient, v_user, 'draft', '', ''
  );

  INSERT INTO public.audio_assets (
    id, clinic_id, report_id, uploaded_by, original_filename,
    mime_type, file_size_bytes, storage_path, ingestion_mode, status
  ) VALUES (
    v_asset, v_clinic, v_report, v_user, 'verify.webm',
    'audio/webm', 1024, v_clinic || '/verify.webm', 'single', 'assigned'
  );

  INSERT INTO public.transcriptions (clinic_id, report_id, audio_asset_id, created_by)
  VALUES (v_clinic, v_report, v_asset, v_user)
  RETURNING id INTO v_transcript;

  -- ── 3. The claim admits exactly one live run ───────────────────────────────
  v_test := v_test + 1;
  INSERT INTO public.transcription_runs
    (clinic_id, transcription_id, audio_asset_id, report_id, status, created_by)
  VALUES (v_clinic, v_transcript, v_asset, v_report, 'processing', v_user)
  RETURNING id INTO v_run_a;
  RAISE NOTICE 'PASS %: first claim accepted', v_test;

  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.transcription_runs
      (clinic_id, transcription_id, audio_asset_id, report_id, status, created_by)
    VALUES (v_clinic, v_transcript, v_asset, v_report, 'processing', v_user);
    RAISE EXCEPTION 'TEST %: a SECOND concurrent claim was accepted', v_test;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS %: concurrent second claim rejected', v_test;
  END;

  -- ── 4. A failed run releases the claim; a completed one does not ───────────
  v_test := v_test + 1;
  UPDATE public.transcription_runs SET status = 'failed', error_code = 'timeout'
   WHERE id = v_run_a;
  INSERT INTO public.transcription_runs
    (clinic_id, transcription_id, audio_asset_id, report_id, status, created_by)
  VALUES (v_clinic, v_transcript, v_asset, v_report, 'processing', v_user)
  RETURNING id INTO v_run_a;
  RAISE NOTICE 'PASS %: retry after failure accepted', v_test;

  v_test := v_test + 1;
  UPDATE public.transcription_runs
     SET status = 'completed', completed_at = now(), raw_text = 'x'
   WHERE id = v_run_a;
  BEGIN
    INSERT INTO public.transcription_runs
      (clinic_id, transcription_id, audio_asset_id, report_id, status, created_by)
    VALUES (v_clinic, v_transcript, v_asset, v_report, 'processing', v_user);
    RAISE EXCEPTION 'TEST %: a completed transcription was re-claimed', v_test;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS %: completed transcription cannot be re-claimed', v_test;
  END;

  v_test := v_test + 1;
  SELECT count(*) INTO v_n FROM public.transcription_runs WHERE audio_asset_id = v_asset;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST %: expected 2 run rows (one failed, one completed), found %', v_test, v_n;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.transcription_runs WHERE audio_asset_id = v_asset AND status = 'failed'
  ) INTO v_failed;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST %: the failed run was not preserved for audit', v_test;
  END IF;
  RAISE NOTICE 'PASS %: failure history preserved (append-only)', v_test;

  -- ── 5. Cross-clinic attachment is refused ──────────────────────────────────
  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.transcription_runs
      (clinic_id, transcription_id, audio_asset_id, report_id, status, created_by)
    VALUES (v_clinic_b, v_transcript, v_asset, v_report, 'processing', v_user);
    RAISE EXCEPTION 'TEST %: a run was attached across clinics', v_test;
  EXCEPTION
    WHEN raise_exception THEN
      IF position('different clinic' in SQLERRM) = 0 THEN RAISE; END IF;
      RAISE NOTICE 'PASS %: cross-clinic run rejected by the guard', v_test;
  END;

  -- ── 6. Status values are constrained ───────────────────────────────────────
  v_test := v_test + 1;
  BEGIN
    UPDATE public.transcription_runs SET status = 'signed' WHERE id = v_run_a;
    RAISE EXCEPTION 'TEST %: an arbitrary status value was accepted', v_test;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS %: status CHECK constraint holds', v_test;
  END;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'R2.7A VERIFICATION COMPLETE — % checks passed.', v_test;
  RAISE NOTICE 'All fixtures roll back; no clinical text was printed.';
END $$;

ROLLBACK;
