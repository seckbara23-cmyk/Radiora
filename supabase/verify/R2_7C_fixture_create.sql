-- R2_7C_fixture_create.sql
-- Creates ONE synthetic patient and ONE synthetic study so that a normal,
-- eligible examination appears in /fr/reports/new.
--
-- WHY SQL AND NOT THE UI
-- R2.1 froze the Patients and Studies product surface. `/patients/new` and
-- `/patients/<id>/studies/new` both match the frozen `/patients` prefix, so
-- middleware 307-redirects an authenticated user to /reports before the form
-- can render. The creation ACTIONS still exist and are untouched — only the
-- surface is closed — so there is no reachable UI path to a new examination.
-- Unfreezing the module for a test would change the product surface, which is
-- not an acceptable trade for a fixture.
--
-- WHAT THIS CREATES — exactly two rows, both unmistakably synthetic:
--   public.patients   1 row   mrn = 'TEST-R27C-001'
--   public.studies    1 row   has_report = false  → eligible in /reports/new
--
-- WHAT THIS DOES NOT DO
--   • no report row — you create that through the normal Radiora UI
--   • no dictation session, audio asset, transcription or run
--   • no UPDATE or DELETE of any existing row, ever
--   • no schema change, no migration, no trigger or RLS change
--   • no hard-coded clinic UUID: the clinic is resolved from YOUR login
--
-- SAFETY: single transaction. Every abort path raises, which rolls the whole
-- thing back. Run it in the Supabase SQL Editor.

BEGIN;

DO $$
DECLARE
  -- ─────────────────────────────────────────────────────────────────────────
  -- ▼▼▼ EDIT THIS ONE LINE ▼▼▼
  -- The email you sign in to Radiora with. The clinic is derived from it, so
  -- no clinic UUID is ever pasted, guessed, or committed to the repository.
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
    RAISE EXCEPTION 'ABORTED: the profile for % has no clinic_id (a super_admin must be linked to a clinic first).', v_email;
  END IF;

  SELECT c.name INTO v_clinic_name FROM public.clinics c WHERE c.id = v_clinic;
  IF v_clinic_name IS NULL THEN
    RAISE EXCEPTION 'ABORTED: clinic % does not exist.', v_clinic;
  END IF;

  RAISE NOTICE 'Target clinic: "%"  (id %)', v_clinic_name, v_clinic;
  RAISE NOTICE 'Operator: %', v_email;

  -- ── 3. Refuse to run twice ────────────────────────────────────────────────
  -- MRN is unique per clinic, so this is the correct scope to check.
  SELECT count(*) INTO v_n
    FROM public.patients
   WHERE clinic_id = v_clinic AND mrn = 'TEST-R27C-001';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTED: patient TEST-R27C-001 already exists in this clinic. Run the verify script, or the cleanup script first.';
  END IF;

  -- ── 4. The synthetic patient ──────────────────────────────────────────────
  -- Columns and enum values are the real ones: patients(clinic_id, mrn,
  -- first_name, last_name, date_of_birth NOT NULL; sex patient_sex; status
  -- patient_status DEFAULT 'active'). phone/email are nullable and left NULL.
  INSERT INTO public.patients
    (clinic_id, mrn, first_name, last_name, date_of_birth, sex, phone, email)
  VALUES
    (v_clinic, 'TEST-R27C-001', 'TEST', 'R2.7C SYNTHETIQUE', DATE '1980-01-01',
     'unknown', NULL, NULL)
  RETURNING id INTO v_patient;

  RAISE NOTICE 'Created patient % (TEST R2.7C SYNTHETIQUE, MRN TEST-R27C-001)', v_patient;

  -- ── 5. The synthetic study ────────────────────────────────────────────────
  -- Accession follows the application convention exactly:
  -- generateAccessionNumber() emits ACC-<YYYYMMDD>-<8 uppercase alphanumerics>.
  -- 'R27CTEST' is 8 characters and is unmistakably synthetic, so this cannot
  -- collide with a generated one in practice — and UNIQUE(clinic_id,
  -- accession_number) would abort the transaction if it somehow did.
  v_accession := 'ACC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-R27CTEST';

  INSERT INTO public.studies
    (clinic_id, patient_id, accession_number, modality, body_part,
     description, study_date, referring_physician, priority, status)
  VALUES
    (v_clinic, v_patient, v_accession, 'CT', 'Cerveau',
     'TEST R2.7C — examen synthétique de validation STT',
     CURRENT_DATE, 'TEST R2.7C', 'routine', 'pending')
  RETURNING id INTO v_study;

  -- has_report is NOT set here: it defaults to false and is maintained by the
  -- reports_sync_has_report trigger. Leaving it to the trigger is what makes
  -- this examination behave exactly like any other.
  RAISE NOTICE 'Created study % (accession %, CT / Cerveau)', v_study, v_accession;

  -- Read back the trigger-maintained flag into a BOOLEAN. An earlier revision
  -- selected it into the integer counter, and boolean→integer is an
  -- explicit-only cast in Postgres while PL/pgSQL assignment uses assignment
  -- context — so that line risked aborting the whole transaction and creating
  -- nothing. It is also the value the operator most wants confirmed.
  SELECT has_report INTO v_has FROM public.studies WHERE id = v_study;
  IF v_has THEN
    RAISE EXCEPTION 'ABORTED: the new study already reports has_report = true; it would not appear in /reports/new.';
  END IF;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'R2.7C fixture created. has_report = false → eligible in /fr/reports/new.';
  RAISE NOTICE 'No report, audio, session or transcription row was created.';
END $$;

COMMIT;
