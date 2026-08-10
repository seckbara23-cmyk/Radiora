-- R2_7B_owner_clinic_trigger.sql
-- Verification for migration 046 (owner-clinic trigger repair).
--
-- This is the test that was missing. It exercises REAL INSERT and UPDATE
-- execution of enforce_dictation_owner_clinic() on ALL THREE attached
-- relations and for EVERY owner variant, including the audio_assets path whose
-- planning failure (42703) went undetected.
--
-- Ordering note: the audio_assets checks run FIRST, deliberately. plpgsql
-- compiles and plans a trigger function per trigger relation, and the original
-- defect is a PLANNING failure — so the relation that could not plan is
-- exercised before anything else has a chance to mask it.
--
-- Every fixture is synthetic and created inside the transaction; the script
-- ROLLS BACK. Fixture UUIDs use hex-only segments (0-9 a-f). Nothing here
-- prints clinical text, a patient identifier, a token or a key.

BEGIN;

DO $$
DECLARE
  v_clinic_a uuid := 'cbbb0000-0000-4000-8000-00000000000a';
  v_clinic_b uuid := 'cbbb0000-0000-4000-8000-00000000000b';
  v_user     uuid := '0b0b0000-0000-4000-8000-00000000000a';
  v_pat_a    uuid := 'bbbb0000-0000-4000-8000-00000000000a';
  v_pat_b    uuid := 'bbbb0000-0000-4000-8000-00000000000b';
  v_study_a  uuid := '57d70000-0000-4000-8000-00000000000a';
  v_study_b  uuid := '57d70000-0000-4000-8000-00000000000b';
  v_rep_a    uuid := '4eef0000-0000-4000-8000-00000000000a';
  v_rep_b    uuid := '4eef0000-0000-4000-8000-00000000000b';
  v_vac_a    uuid := '7ac00000-0000-4000-8000-00000000000a';
  v_vac_b    uuid := '7ac00000-0000-4000-8000-00000000000b';
  v_item_a   uuid := '17e00000-0000-4000-8000-00000000000a';
  v_item_b   uuid := '17e00000-0000-4000-8000-00000000000b';
  v_asset    uuid;
  v_test     integer := 0;
BEGIN
  -- ── Fixtures: two complete, isolated clinics ───────────────────────────────
  INSERT INTO public.clinics (id, name, slug) VALUES
    (v_clinic_a, 'R2.7B Clinic A', 'r27b-verify-clinic-a'),
    (v_clinic_b, 'R2.7B Clinic B', 'r27b-verify-clinic-b');

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'r27b.verify@test.local', '',
    now(), now(), now()
  );
  UPDATE public.profiles SET clinic_id = v_clinic_a, role = 'radiologist' WHERE id = v_user;

  INSERT INTO public.patients (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex) VALUES
    (v_pat_a, v_clinic_a, 'R27B-A', 'Test', 'Fixture', '1980-01-01', 'unknown'),
    (v_pat_b, v_clinic_b, 'R27B-B', 'Test', 'Fixture', '1980-01-01', 'unknown');

  INSERT INTO public.studies (id, clinic_id, patient_id, accession_number, modality, body_part, study_date, status) VALUES
    (v_study_a, v_clinic_a, v_pat_a, 'ACC-R27B-A', 'CT', 'Thorax', current_date, 'pending'),
    (v_study_b, v_clinic_b, v_pat_b, 'ACC-R27B-B', 'CT', 'Thorax', current_date, 'pending');

  INSERT INTO public.reports (id, clinic_id, study_id, patient_id, author_id, status, findings, impression) VALUES
    (v_rep_a, v_clinic_a, v_study_a, v_pat_a, v_user, 'draft', '', ''),
    (v_rep_b, v_clinic_b, v_study_b, v_pat_b, v_user, 'draft', '', '');

  INSERT INTO public.vacations (id, clinic_id, title, modality, vacation_date, created_by) VALUES
    (v_vac_a, v_clinic_a, 'R2.7B vacation A', 'CT', current_date, v_user),
    (v_vac_b, v_clinic_b, 'R2.7B vacation B', 'CT', current_date, v_user);

  INSERT INTO public.vacation_items (id, clinic_id, vacation_id, position, workflow_status, created_by) VALUES
    (v_item_a, v_clinic_a, v_vac_a, 0, 'audio_received', v_user),
    (v_item_b, v_clinic_b, v_vac_b, 0, 'audio_received', v_user);

  -- ══ audio_assets — the relation the old function could not plan for ════════

  -- 1. Unassigned audio (both owners NULL) must still insert: batch and long
  --    ingestion store audio before it is assigned to anything.
  v_test := v_test + 1;
  INSERT INTO public.audio_assets
    (clinic_id, uploaded_by, original_filename, mime_type, storage_path)
  VALUES (v_clinic_a, v_user, 'unassigned.webm', 'audio/webm', 'a/unassigned.webm')
  RETURNING id INTO v_asset;
  RAISE NOTICE 'PASS %: unassigned audio asset accepted', v_test;

  -- 2. Report-owned audio in the SAME clinic. This is the exact INSERT that
  --    failed with 42703 before migration 046.
  v_test := v_test + 1;
  INSERT INTO public.audio_assets
    (clinic_id, report_id, uploaded_by, original_filename, mime_type, storage_path)
  VALUES (v_clinic_a, v_rep_a, v_user, 'report.webm', 'audio/webm', 'a/report.webm')
  RETURNING id INTO v_asset;
  RAISE NOTICE 'PASS %: report-owned audio asset accepted', v_test;

  -- 3. Vacation-owned audio in the same clinic.
  v_test := v_test + 1;
  INSERT INTO public.audio_assets
    (clinic_id, vacation_id, uploaded_by, original_filename, mime_type, storage_path)
  VALUES (v_clinic_a, v_vac_a, v_user, 'queue.webm', 'audio/webm', 'a/queue.webm');
  RAISE NOTICE 'PASS %: vacation-owned audio asset accepted', v_test;

  -- 4. Both owners at once is refused (the 044 CHECK, still intact).
  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.audio_assets
      (clinic_id, vacation_id, report_id, uploaded_by, original_filename, mime_type, storage_path)
    VALUES (v_clinic_a, v_vac_a, v_rep_a, v_user, 'both.webm', 'audio/webm', 'a/both.webm');
    RAISE EXCEPTION 'TEST %: an audio asset with BOTH owners was accepted', v_test;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS %: audio asset with both owners rejected', v_test;
  END;

  -- 5. Cross-clinic REPORT owner is refused.
  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.audio_assets
      (clinic_id, report_id, uploaded_by, original_filename, mime_type, storage_path)
    VALUES (v_clinic_a, v_rep_b, v_user, 'x.webm', 'audio/webm', 'a/x.webm');
    RAISE EXCEPTION 'TEST %: cross-clinic report-owned audio was accepted', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic report-owned audio rejected', v_test;
  END;

  -- 6. Cross-clinic VACATION owner is refused. This link was never validated
  --    before 046, because the old queue branch could not run here at all.
  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.audio_assets
      (clinic_id, vacation_id, uploaded_by, original_filename, mime_type, storage_path)
    VALUES (v_clinic_a, v_vac_b, v_user, 'y.webm', 'audio/webm', 'a/y.webm');
    RAISE EXCEPTION 'TEST %: cross-clinic vacation-owned audio was accepted', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic vacation-owned audio rejected', v_test;
  END;

  -- 7. UPDATE fires the trigger too — R2.7A sets status = 'transcribed'.
  v_test := v_test + 1;
  UPDATE public.audio_assets SET status = 'transcribed' WHERE id = v_asset;
  RAISE NOTICE 'PASS %: audio asset UPDATE passes the guard', v_test;

  -- 8. An UPDATE cannot move audio to another clinic's report.
  v_test := v_test + 1;
  BEGIN
    UPDATE public.audio_assets SET report_id = v_rep_b WHERE id = v_asset;
    RAISE EXCEPTION 'TEST %: an UPDATE re-owned audio across clinics', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic re-owning UPDATE rejected', v_test;
  END;

  -- ══ dictation_sessions ═════════════════════════════════════════════════════
  v_test := v_test + 1;
  INSERT INTO public.dictation_sessions (clinic_id, vacation_item_id, created_by, token, expires_at)
  VALUES (v_clinic_a, v_item_a, v_user, 'r27b-token-queue', now() + interval '30 minutes');
  RAISE NOTICE 'PASS %: queue-owned session accepted', v_test;

  v_test := v_test + 1;
  INSERT INTO public.dictation_sessions (clinic_id, report_id, created_by, token, expires_at)
  VALUES (v_clinic_a, v_rep_a, v_user, 'r27b-token-report', now() + interval '30 minutes');
  RAISE NOTICE 'PASS %: report-owned session accepted', v_test;

  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.dictation_sessions (clinic_id, report_id, created_by, token, expires_at)
    VALUES (v_clinic_a, v_rep_b, v_user, 'r27b-token-x', now() + interval '30 minutes');
    RAISE EXCEPTION 'TEST %: cross-clinic report session was accepted', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic report session rejected', v_test;
  END;

  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.dictation_sessions (clinic_id, vacation_item_id, created_by, token, expires_at)
    VALUES (v_clinic_a, v_item_b, v_user, 'r27b-token-y', now() + interval '30 minutes');
    RAISE EXCEPTION 'TEST %: cross-clinic queue session was accepted', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic queue session rejected', v_test;
  END;

  -- ══ transcriptions ═════════════════════════════════════════════════════════
  v_test := v_test + 1;
  INSERT INTO public.transcriptions (clinic_id, vacation_item_id, created_by)
  VALUES (v_clinic_a, v_item_a, v_user);
  RAISE NOTICE 'PASS %: queue-owned transcription accepted', v_test;

  v_test := v_test + 1;
  INSERT INTO public.transcriptions (clinic_id, report_id, created_by)
  VALUES (v_clinic_a, v_rep_a, v_user);
  RAISE NOTICE 'PASS %: report-owned transcription accepted', v_test;

  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.transcriptions (clinic_id, report_id, created_by)
    VALUES (v_clinic_a, v_rep_b, v_user);
    RAISE EXCEPTION 'TEST %: cross-clinic report transcription was accepted', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic report transcription rejected', v_test;
  END;

  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.transcriptions (clinic_id, vacation_item_id, created_by)
    VALUES (v_clinic_a, v_item_b, v_user);
    RAISE EXCEPTION 'TEST %: cross-clinic queue transcription was accepted', v_test;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS %: cross-clinic queue transcription rejected', v_test;
  END;

  -- ══ A non-existent owner is refused, not silently accepted ═════════════════
  v_test := v_test + 1;
  BEGIN
    INSERT INTO public.transcriptions (clinic_id, report_id, created_by)
    VALUES (v_clinic_a, '4eef0000-0000-4000-8000-0000000000ff', v_user);
    RAISE EXCEPTION 'TEST %: a transcription for a non-existent report was accepted', v_test;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS %: non-existent owner rejected', v_test;
  END;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'R2.7B VERIFICATION COMPLETE — % checks passed.', v_test;
  RAISE NOTICE 'All three relations exercised for real; all fixtures roll back.';
END $$;

-- ── Structural check: the function names no column that is absent from any of
--    its attached relations. Runs outside the fixture block so it is reported
--    even if a behavioural check above changes.
DO $$
DECLARE
  v_src  text;
  v_rel  text;
  v_col  text;
  v_bad  integer := 0;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforce_dictation_owner_clinic';

  FOR v_rel IN SELECT unnest(ARRAY['dictation_sessions', 'transcriptions', 'audio_assets']) LOOP
    FOR v_col IN SELECT unnest(ARRAY['report_id', 'vacation_item_id', 'vacation_id', 'clinic_id']) LOOP
      IF v_src ~* ('\mnew\s*\.\s*' || v_col || '\M')
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = v_rel AND column_name = v_col
         )
      THEN
        RAISE WARNING 'UNSAFE: the function dereferences NEW.% but public.% has no such column', v_col, v_rel;
        v_bad := v_bad + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'R2.7B STRUCTURAL CHECK FAILED: % unsafe field reference(s).', v_bad;
  END IF;
  RAISE NOTICE 'PASS: no unsafe NEW.<column> reference for any attached relation.';
END $$;

ROLLBACK;
