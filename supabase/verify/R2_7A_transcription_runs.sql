-- R2_7A_transcription_runs.sql
-- Verification for migration 045 (automatic speech-to-text).
--
-- Read-only with respect to real data: every fixture is created inside the
-- transaction and the whole script ROLLS BACK at the end. Nothing here prints
-- clinical text, a transcript, a patient identifier or a provider key.
--
-- Fixture UUIDs use hex-only segments. 'v', 'i', 's' and similar letters are NOT
-- valid hex and produce a 22P02 invalid-input error before any test runs — the
-- mistake that aborted the R0.8A verification run. Allowed: 0-9 a-f.
--
--   clinic  ceee...   report  4eef...   asset  a55e...   user  0b0b...
--
-- Run in the Supabase SQL editor. Every check raises NOTICE 'PASS' or fails
-- loudly with an exception.

BEGIN;

DO $$
DECLARE
  v_clinic     uuid := 'ceee0000-0000-4000-8000-000000000001';
  v_clinic_b   uuid := 'ceee0000-0000-4000-8000-000000000002';
  v_user       uuid;
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
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'SKIP: no auth.users row available; behavioural tests need one.';
    RAISE EXCEPTION 'VERIFICATION INCOMPLETE — create a user and re-run.';
  END IF;

  INSERT INTO public.clinics (id, name) VALUES (v_clinic, 'R2.7A Verify A')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.clinics (id, name) VALUES (v_clinic_b, 'R2.7A Verify B')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.reports (id, clinic_id, status, findings, impression, created_by)
  VALUES (v_report, v_clinic, 'draft', '', '', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.audio_assets (
    id, clinic_id, report_id, uploaded_by, original_filename,
    mime_type, file_size_bytes, storage_path, ingestion_mode, status
  ) VALUES (
    v_asset, v_clinic, v_report, v_user, 'verify.webm',
    'audio/webm', 1024, v_clinic || '/verify.webm', 'single', 'assigned'
  ) ON CONFLICT (id) DO NOTHING;

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
