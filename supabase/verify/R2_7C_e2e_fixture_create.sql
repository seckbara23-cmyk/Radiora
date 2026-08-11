-- R2_7C_e2e_fixture_create.sql
-- A FRESH, DISPOSABLE synthetic examination for the R2.7C production E2E.
--
-- WHY A SECOND FIXTURE
-- Report 2413e4b3-93b4-4cfe-b95d-06942ad7b8fe and its v1/v2 history are
-- preserved production evidence. This script CANNOT touch them: it creates a
-- different patient (MRN TEST-R27CE2E-001) and a different accession, and it
-- aborts if its own patient already exists. Nothing here updates or deletes
-- any existing row.
--
-- WHAT THIS CREATES — exactly two rows, both unmistakably synthetic:
--   public.patients   1 row   mrn = 'TEST-R27CE2E-001'
--   public.studies    1 row   has_report = false  → eligible in /fr/reports/new
--
-- WHAT THIS DOES NOT DO
--   • no report row — you create that through the normal Radiora UI
--   • no dictation session, audio asset, transcription or run
--   • no UPDATE or DELETE of any existing row, ever
--   • no schema change, no migration, no trigger or RLS change
--   • no hard-coded clinic UUID: the clinic is resolved from YOUR login
--
-- NO REAL PATIENT DATA. The identity below is obviously synthetic.
--
-- SAFETY: single transaction. Every abort path raises, which rolls the whole
-- thing back. Run it in the Supabase SQL Editor.

BEGIN;

DO $$
DECLARE
  -- ─────────────────────────────────────────────────────────────────────────
  -- ▼▼▼ EDIT THIS ONE LINE ▼▼▼
  v_email text := 'CHANGE-ME@example.com';
  -- ▲▲▲ EDIT THIS ONE LINE ▲▲▲
  -- ─────────────────────────────────────────────────────────────────────────

  v_user        uuid;
  v_clinic      uuid;
  v_clinic_name text;
  v_n           integer;
  v_has         boolean;
  v_patient     uuid;
  v_study       uuid;
  v_accession   text;
BEGIN
  IF v_email = 'CHANGE-ME@example.com' THEN
    RAISE EXCEPTION 'ABORTED: set v_email to your Radiora login before running.';
  END IF;

  -- ── 1. Resolve the operator, unambiguously ────────────────────────────────
  SELECT count(*) INTO v_n FROM auth.users u WHERE lower(u.email) = lower(v_email);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'ABORTED: no account with email %.', v_email;
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'ABORTED: % accounts match % — cannot resolve one clinic.', v_n, v_email;
  END IF;

  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(v_email);

  -- ── 2. Resolve THAT account's clinic. Never LIMIT 1, never another tenant ──
  SELECT p.clinic_id INTO v_clinic FROM public.profiles p WHERE p.id = v_user;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'ABORTED: the profile for % has no clinic_id.', v_email;
  END IF;

  SELECT c.name INTO v_clinic_name FROM public.clinics c WHERE c.id = v_clinic;
  IF v_clinic_name IS NULL THEN
    RAISE EXCEPTION 'ABORTED: clinic % does not exist.', v_clinic;
  END IF;

  RAISE NOTICE 'Target clinic: "%"  (id %)', v_clinic_name, v_clinic;

  -- ── 3. Refuse to run twice ────────────────────────────────────────────────
  SELECT count(*) INTO v_n
    FROM public.patients
   WHERE clinic_id = v_clinic AND mrn = 'TEST-R27CE2E-001';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTED: patient TEST-R27CE2E-001 already exists in this clinic. Use the existing one, or run the cleanup script first.';
  END IF;

  -- ── 4. Guard the PRESERVED R2.7C fixture ──────────────────────────────────
  -- This script must never be mistaken for a rerun of the original one.
  IF EXISTS (SELECT 1 FROM public.patients
              WHERE clinic_id = v_clinic AND mrn = 'TEST-R27C-001') THEN
    RAISE NOTICE 'NOTE: the original TEST-R27C-001 fixture is present and is NOT touched by this script.';
  END IF;

  -- ── 5. The synthetic patient ──────────────────────────────────────────────
  INSERT INTO public.patients
    (clinic_id, mrn, first_name, last_name, date_of_birth, sex, phone, email)
  VALUES
    (v_clinic, 'TEST-R27CE2E-001', 'TEST', 'R2.7C E2E SYNTHETIQUE', DATE '1980-01-01',
     'unknown', NULL, NULL)
  RETURNING id INTO v_patient;

  RAISE NOTICE 'Created patient % (MRN TEST-R27CE2E-001)', v_patient;

  -- ── 6. The synthetic study ────────────────────────────────────────────────
  -- Accession follows generateAccessionNumber()'s convention:
  -- ACC-<YYYYMMDD>-<8 uppercase alphanumerics>. 'R27CE2E1' is 8 characters and
  -- is distinct from the original fixture's 'R27CTEST'.
  v_accession := 'ACC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-R27CE2E1';

  INSERT INTO public.studies
    (clinic_id, patient_id, accession_number, modality, body_part,
     description, study_date, referring_physician, priority, status)
  VALUES
    (v_clinic, v_patient, v_accession, 'CT', 'Cerveau',
     'TEST R2.7C E2E — examen synthetique de cloture',
     CURRENT_DATE, 'TEST R2.7C E2E', 'routine', 'pending')
  RETURNING id INTO v_study;

  -- has_report is left to the reports_sync_has_report trigger, so this
  -- examination behaves exactly like any other.
  SELECT has_report INTO v_has FROM public.studies WHERE id = v_study;
  IF v_has THEN
    RAISE EXCEPTION 'ABORTED: the new study already reports has_report = true.';
  END IF;

  RAISE NOTICE 'Created study % (accession %, CT / Cerveau)', v_study, v_accession;
  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'R2.7C E2E fixture ready. has_report = false → eligible in /fr/reports/new.';
  RAISE NOTICE 'The original TEST-R27C-001 fixture and report 2413e4b3... are UNTOUCHED.';
END $$;

COMMIT;
