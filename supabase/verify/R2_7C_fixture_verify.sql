-- R2_7C_fixture_verify.sql
-- Read-only. Proves the synthetic fixture is present, correctly owned, and
-- eligible for /fr/reports/new. Creates nothing, changes nothing.
--
-- Safe to run at any point: before the E2E to confirm eligibility, and again
-- afterwards to confirm the report/audio/transcription rows the E2E produced.

BEGIN;

DO $$
DECLARE
  -- ▼ the same login you used in R2_7C_fixture_create.sql
  v_email text := 'CHANGE-ME@example.com';

  v_user     uuid;
  v_clinic   uuid;
  v_patient  uuid;
  v_study    uuid;
  v_n        integer;
  v_has      boolean;
  v_acc      text;
  v_test     integer := 0;
BEGIN
  IF v_email = 'CHANGE-ME@example.com' THEN
    RAISE EXCEPTION 'ABORTED: set v_email to your Radiora login before running.';
  END IF;

  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(v_email);
  IF v_user IS NULL THEN RAISE EXCEPTION 'ABORTED: no account with email %.', v_email; END IF;
  SELECT p.clinic_id INTO v_clinic FROM public.profiles p WHERE p.id = v_user;
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'ABORTED: profile has no clinic.'; END IF;

  -- ── 1. Exactly one synthetic patient, in THIS clinic ──────────────────────
  v_test := v_test + 1;
  SELECT count(*) INTO v_n
    FROM public.patients WHERE clinic_id = v_clinic AND mrn = 'TEST-R27C-001';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST %: expected exactly 1 patient TEST-R27C-001 in this clinic, found %.', v_test, v_n;
  END IF;
  SELECT id INTO v_patient
    FROM public.patients WHERE clinic_id = v_clinic AND mrn = 'TEST-R27C-001';
  RAISE NOTICE 'PASS %: one synthetic patient, owned by this clinic', v_test;

  -- ── 2. It leaked into no other tenant ─────────────────────────────────────
  v_test := v_test + 1;
  SELECT count(*) INTO v_n
    FROM public.patients WHERE mrn = 'TEST-R27C-001' AND clinic_id <> v_clinic;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST %: % copy/copies of the fixture exist in OTHER clinics.', v_test, v_n;
  END IF;
  RAISE NOTICE 'PASS %: no copy in any other clinic', v_test;

  -- ── 3. Exactly one associated study, same clinic ──────────────────────────
  v_test := v_test + 1;
  SELECT count(*) INTO v_n FROM public.studies WHERE patient_id = v_patient;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST %: expected exactly 1 study for the fixture patient, found %.', v_test, v_n;
  END IF;
  SELECT id, has_report, accession_number INTO v_study, v_has, v_acc
    FROM public.studies WHERE patient_id = v_patient;

  SELECT count(*) INTO v_n
    FROM public.studies WHERE id = v_study AND clinic_id = v_clinic;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST %: the study is not owned by the operator clinic.', v_test;
  END IF;
  RAISE NOTICE 'PASS %: one study (accession %), owned by this clinic', v_test, v_acc;

  -- ── 4. Eligibility for /fr/reports/new ────────────────────────────────────
  -- The page lists studies where has_report = false.
  v_test := v_test + 1;
  IF v_has THEN
    RAISE NOTICE 'NOTE %: has_report = TRUE — a report already exists for this study.', v_test;
    RAISE NOTICE '        That is EXPECTED once you have created the report in the UI.';
    RAISE NOTICE '        Before creating it, this must be false.';
  ELSE
    RAISE NOTICE 'PASS %: has_report = false — the examination is eligible in /fr/reports/new', v_test;
  END IF;

  -- ── 5. Report count, stated plainly ───────────────────────────────────────
  v_test := v_test + 1;
  SELECT count(*) INTO v_n FROM public.reports WHERE study_id = v_study;
  IF v_n = 0 THEN
    RAISE NOTICE 'PASS %: no report yet — create it through the Radiora UI', v_test;
  ELSE
    RAISE NOTICE 'NOTE %: % report(s) exist for the fixture study (expected after the UI step)', v_test, v_n;
  END IF;

  -- ── 6. Nothing else was manufactured ──────────────────────────────────────
  v_test := v_test + 1;
  SELECT count(*) INTO v_n
    FROM public.audio_assets a
    JOIN public.reports r ON r.id = a.report_id
   WHERE r.study_id = v_study;
  RAISE NOTICE 'INFO %: % audio asset(s) attached (0 before the E2E, 1+ after)', v_test, v_n;

  SELECT count(*) INTO v_n
    FROM public.transcription_runs tr
    JOIN public.reports r ON r.id = tr.report_id
   WHERE r.study_id = v_study;
  RAISE NOTICE 'INFO: % transcription run(s) (0 before the E2E)', v_n;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'R2.7C fixture verification complete.';
  RAISE NOTICE 'patient % / study %', v_patient, v_study;
END $$;

ROLLBACK;
