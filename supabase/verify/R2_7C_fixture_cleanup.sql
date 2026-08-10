-- R2_7C_fixture_cleanup.sql
--
-- ███  DO NOT RUN YET  ███
-- Run this ONLY after the phone and import E2E are complete and the evidence
-- has been recorded. Deleting the fixture destroys the transcription_runs rows
-- that ARE the evidence.
--
-- Removes the synthetic R2.7C fixture and everything the E2E attached to it,
-- and nothing else. It refuses to run when the situation is not exactly what
-- it expects.
--
-- ── STORAGE ──────────────────────────────────────────────────────────────────
-- Audio uploaded during the E2E lives in the PRIVATE `dictation-audio` bucket
-- at `<clinic_id>/<audio_asset_id>.<ext>`. Database rows and storage objects
-- are separate systems: deleting audio_assets does NOT remove the object.
--
-- This script therefore PRINTS every storage path belonging to the fixture
-- BEFORE deleting the rows that reference them, and stops there by default.
-- Section 5 at the end contains the storage deletion, commented out — read the
-- printed list first, then uncomment it or delete those objects from the
-- Supabase Storage UI. Nothing is left silently unresolved.

BEGIN;

DO $$
DECLARE
  -- ▼ the same login you used in R2_7C_fixture_create.sql
  v_email text := 'CHANGE-ME@example.com';

  v_user     uuid;
  v_clinic   uuid;
  v_patient  uuid;
  v_n        integer;
  v_path     text;
BEGIN
  IF v_email = 'CHANGE-ME@example.com' THEN
    RAISE EXCEPTION 'ABORTED: set v_email to your Radiora login before running.';
  END IF;

  -- ── 1. Resolve the operator's clinic, unambiguously ───────────────────────
  SELECT count(*) INTO v_n FROM auth.users u WHERE lower(u.email) = lower(v_email);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTED: % accounts match % — ownership is ambiguous.', v_n, v_email;
  END IF;
  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(v_email);
  SELECT p.clinic_id INTO v_clinic FROM public.profiles p WHERE p.id = v_user;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'ABORTED: the profile for % has no clinic.', v_email;
  END IF;

  -- ── 2. Match EXACTLY the expected fixture, or refuse ──────────────────────
  SELECT count(*) INTO v_n
    FROM public.patients WHERE clinic_id = v_clinic AND mrn = 'TEST-R27C-001';
  IF v_n = 0 THEN
    RAISE NOTICE 'Nothing to clean: no TEST-R27C-001 patient in this clinic.';
    RETURN;
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'ABORTED: % patients match TEST-R27C-001 — refusing to guess.', v_n;
  END IF;

  SELECT id INTO v_patient
    FROM public.patients WHERE clinic_id = v_clinic AND mrn = 'TEST-R27C-001';

  -- The fixture is one patient with one study. Anything more means something
  -- unexpected attached itself, and a bulk delete is the wrong response.
  SELECT count(*) INTO v_n FROM public.studies WHERE patient_id = v_patient;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'ABORTED: the fixture patient has % studies, expected at most 1. Investigate.', v_n;
  END IF;

  -- ── 3. Never delete signed clinical content ───────────────────────────────
  SELECT count(*) INTO v_n
    FROM public.reports
   WHERE patient_id = v_patient AND status IN ('finalized', 'amended');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTED: % finalized/amended report(s) exist for the fixture. A signed report is immutable; investigate rather than delete.', v_n;
  END IF;

  -- Belt and braces: every row about to be touched must be in this clinic.
  SELECT count(*) INTO v_n FROM public.reports
   WHERE patient_id = v_patient AND clinic_id <> v_clinic;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTED: % fixture report(s) belong to another clinic.', v_n;
  END IF;

  -- ── 4. Print the storage objects BEFORE their rows disappear ──────────────
  RAISE NOTICE '── Storage objects in bucket "dictation-audio" to remove manually ──';
  v_n := 0;
  FOR v_path IN
    SELECT a.storage_path
      FROM public.audio_assets a
      JOIN public.reports r ON r.id = a.report_id
     WHERE r.patient_id = v_patient
     ORDER BY a.created_at
  LOOP
    RAISE NOTICE '  %', v_path;
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN
    RAISE NOTICE '  (none — no audio was uploaded for this fixture)';
  ELSE
    RAISE NOTICE '  % object(s). See section 5 of this file.', v_n;
  END IF;

  -- ── 5. Delete, child rows first ───────────────────────────────────────────
  DELETE FROM public.transcription_runs
   WHERE report_id IN (SELECT id FROM public.reports WHERE patient_id = v_patient);
  DELETE FROM public.transcriptions
   WHERE report_id IN (SELECT id FROM public.reports WHERE patient_id = v_patient);
  DELETE FROM public.dictation_sessions
   WHERE report_id IN (SELECT id FROM public.reports WHERE patient_id = v_patient);
  DELETE FROM public.audio_assets
   WHERE report_id IN (SELECT id FROM public.reports WHERE patient_id = v_patient);
  DELETE FROM public.reports  WHERE patient_id = v_patient;
  DELETE FROM public.studies  WHERE patient_id = v_patient;
  DELETE FROM public.patients WHERE id = v_patient;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'R2.7C fixture removed from clinic %.', v_clinic;
  RAISE NOTICE 'Storage objects listed above are NOT deleted by this script.';
END $$;

COMMIT;

-- ─── 5. Storage cleanup — run separately, AFTER reading the printed list ─────
-- Uncomment and substitute the paths printed above. Deliberately not automatic:
-- a wrong predicate here deletes another clinic's audio, and storage has no
-- transaction to roll back.
--
--   DELETE FROM storage.objects
--    WHERE bucket_id = 'dictation-audio'
--      AND name IN (
--        '<paste each printed path here>'
--      );
--
-- Alternatively delete them from Supabase → Storage → dictation-audio, where
-- the folder is your clinic id and the file names are the audio asset ids.
