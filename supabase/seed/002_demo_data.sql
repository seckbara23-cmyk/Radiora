-- =============================================================================
-- Seed: Demo clinic data — patients, studies, and reports
-- =============================================================================
--
-- PREREQUISITES
--   Run 001_initial_admin.sql first to create your clinic and first admin user.
--
-- BEFORE RUNNING — replace the two placeholder values below:
--
--   v_clinic_uuid  — copy from the "Clinic created →" notice in seed 001 output,
--                    OR run: SELECT id, name FROM public.clinics ORDER BY created_at DESC LIMIT 1;
--
--   v_author_uuid  — the UUID of any existing auth user who will author the demo
--                    reports (your clinic_admin or a radiologist). Must already
--                    have a profile row (created automatically via handle_new_user).
--                    Find it: Dashboard → Authentication → Users → click the user.
--
-- SAFE TO RE-RUN
--   All inserts use ON CONFLICT (id) DO NOTHING with fixed demo UUIDs, so
--   running this script more than once will not create duplicate rows.
--
-- =============================================================================

do $$
declare
  -- ── ❶ Replace these two values before running ─────────────────────────────
  v_clinic_uuid  uuid := 'YOUR_CLINIC_UUID';    -- ← from seed 001 output
  v_author_uuid  uuid := 'YOUR_AUTH_USER_UUID'; -- ← existing auth user UUID
  -- ──────────────────────────────────────────────────────────────────────────

  -- Fixed demo UUIDs (re-runnable; clearly non-production identifiers)
  v_pat1 uuid := '10000000-0000-0000-0000-000000000001';
  v_pat2 uuid := '10000000-0000-0000-0000-000000000002';
  v_pat3 uuid := '10000000-0000-0000-0000-000000000003';
  v_pat4 uuid := '10000000-0000-0000-0000-000000000004';
  v_pat5 uuid := '10000000-0000-0000-0000-000000000005';

  v_stu1 uuid := '20000000-0000-0000-0000-000000000001';
  v_stu2 uuid := '20000000-0000-0000-0000-000000000002';
  v_stu3 uuid := '20000000-0000-0000-0000-000000000003';
  v_stu4 uuid := '20000000-0000-0000-0000-000000000004';
  v_stu5 uuid := '20000000-0000-0000-0000-000000000005';

  v_rep1 uuid := '30000000-0000-0000-0000-000000000001';
  v_rep2 uuid := '30000000-0000-0000-0000-000000000002';
  v_rep3 uuid := '30000000-0000-0000-0000-000000000003';
  v_rep4 uuid := '30000000-0000-0000-0000-000000000004';

begin

  -- ── Guards ─────────────────────────────────────────────────────────────────

  if v_clinic_uuid = 'YOUR_CLINIC_UUID'::uuid then
    raise exception
      E'\n\nReplace v_clinic_uuid with your real clinic UUID before running.\n'
      'Find it: SELECT id, name FROM public.clinics ORDER BY created_at DESC LIMIT 1;';
  end if;

  if v_author_uuid = 'YOUR_AUTH_USER_UUID'::uuid then
    raise exception
      E'\n\nReplace v_author_uuid with a real auth user UUID before running.\n'
      'Find it: Dashboard → Authentication → Users → click the user.';
  end if;

  if not exists (select 1 from public.clinics where id = v_clinic_uuid) then
    raise exception
      E'\n\nClinic % not found.\nRun 001_initial_admin.sql first, then paste the clinic UUID here.',
      v_clinic_uuid;
  end if;

  if not exists (select 1 from public.profiles where id = v_author_uuid) then
    raise exception
      E'\n\nNo profile found for user %.\n'
       'Create the auth user via Dashboard → Authentication → Users first.\n'
       'The handle_new_user() trigger will auto-create the profile stub.',
      v_author_uuid;
  end if;

  -- ── Patients ───────────────────────────────────────────────────────────────

  insert into public.patients
    (id, clinic_id, mrn, first_name, last_name, date_of_birth, sex, status)
  values
    (v_pat1, v_clinic_uuid, 'MRN-0001', 'James',  'Wilson',  '1959-03-14', 'male',    'active'),
    (v_pat2, v_clinic_uuid, 'MRN-0002', 'Maria',  'Santos',  '1982-07-22', 'female',  'active'),
    (v_pat3, v_clinic_uuid, 'MRN-0003', 'Robert', 'Chen',    '1966-11-08', 'male',    'active'),
    (v_pat4, v_clinic_uuid, 'MRN-0004', 'Emma',   'Johnson', '1996-04-15', 'female',  'active'),
    (v_pat5, v_clinic_uuid, 'MRN-0005', 'David',  'Park',    '1979-09-30', 'male',    'active')
  on conflict (id) do nothing;

  -- ── Studies ────────────────────────────────────────────────────────────────
  -- Modalities: XR = plain radiograph, CT = computed tomography,
  --             MRI = magnetic resonance, US = ultrasound

  insert into public.studies
    (id, clinic_id, patient_id, accession_number, modality, body_part,
     description, study_date, referring_physician, priority, status)
  values
    (v_stu1, v_clinic_uuid, v_pat1, 'ACC-2026-0001', 'XR',  'Chest',
     'PA and lateral chest radiograph',
     '2026-05-10', 'Dr. A. Patel',   'urgent',  'reported'),

    (v_stu2, v_clinic_uuid, v_pat2, 'ACC-2026-0002', 'CT',  'Abdomen',
     'CT abdomen and pelvis with contrast',
     '2026-05-12', 'Dr. L. Kim',     'routine', 'reported'),

    (v_stu3, v_clinic_uuid, v_pat3, 'ACC-2026-0003', 'MRI', 'Brain',
     'MRI brain with and without gadolinium contrast',
     '2026-05-14', 'Dr. S. Okonkwo', 'routine', 'validated'),

    (v_stu4, v_clinic_uuid, v_pat4, 'ACC-2026-0004', 'US',  'Obstetric',
     'Obstetric ultrasound — mid-trimester anatomy survey',
     '2026-05-15', 'Dr. R. Navarro', 'routine', 'validated'),

    (v_stu5, v_clinic_uuid, v_pat5, 'ACC-2026-0005', 'XR',  'Knee',
     'AP and lateral left knee radiograph',
     '2026-05-18', 'Dr. T. Brooks',  'routine', 'pending')
  on conflict (id) do nothing;

  -- ── Reports ────────────────────────────────────────────────────────────────
  -- The reports_sync_has_report trigger fires on INSERT and sets
  -- studies.has_report = true automatically for the linked study.
  --
  -- The handle_report_finalized trigger only fires on UPDATE, so finalized
  -- reports inserted here must include signed_at explicitly.

  -- Draft — Chest X-ray (Study 1 · Patient: James Wilson)
  insert into public.reports
    (id, clinic_id, study_id, patient_id, author_id,
     status, findings, impression, recommendations)
  values (
    v_rep1, v_clinic_uuid, v_stu1, v_pat1, v_author_uuid,
    'draft',
    'The lungs demonstrate right lower lobe consolidation with air bronchograms. '
    'The cardiac silhouette is within normal limits. No pleural effusion identified. '
    'The bony thorax is intact. The mediastinum is not widened.',
    'Right lower lobe consolidation, most likely representing community-acquired pneumonia.',
    'Clinical correlation recommended. Follow-up chest X-ray in 6–8 weeks to confirm resolution.'
  ) on conflict (id) do nothing;

  -- Draft — CT Abdomen (Study 2 · Patient: Maria Santos)
  insert into public.reports
    (id, clinic_id, study_id, patient_id, author_id,
     status, findings, impression, recommendations)
  values (
    v_rep2, v_clinic_uuid, v_stu2, v_pat2, v_author_uuid,
    'draft',
    'The liver demonstrates diffuse decreased attenuation consistent with hepatic steatosis. '
    'No focal hepatic lesion identified. Gallbladder, pancreas, spleen, and bilateral kidneys '
    'appear unremarkable. No free air or free fluid. No lymphadenopathy. '
    'Bowel gas pattern is within normal limits.',
    'Mild hepatic steatosis. No acute intra-abdominal pathology identified.',
    'Correlation with liver function tests recommended. Lifestyle modification counselling advised.'
  ) on conflict (id) do nothing;

  -- Finalized — Brain MRI (Study 3 · Patient: Robert Chen)
  insert into public.reports
    (id, clinic_id, study_id, patient_id, author_id,
     status, findings, impression, recommendations, signed_at)
  values (
    v_rep3, v_clinic_uuid, v_stu3, v_pat3, v_author_uuid,
    'finalized',
    'Multiple T2/FLAIR hyperintense foci in the periventricular and subcortical white matter '
    'bilaterally, measuring up to 5 mm in greatest dimension. No diffusion restriction to suggest '
    'acute infarction. No enhancing lesions following gadolinium administration. '
    'The ventricles and sulci are appropriate for patient age. No midline shift or herniation.',
    'Scattered T2/FLAIR white matter hyperintensities, most likely representing small vessel '
    'ischaemic disease in the context of the patient''s age and vascular risk factors. '
    'No evidence of acute infarction or demyelinating disease.',
    'Neurology consultation recommended. Risk factor optimisation (hypertension, hyperlipidaemia) '
    'advised. Follow-up MRI brain in 12 months.',
    '2026-05-14 14:30:00+00'
  ) on conflict (id) do nothing;

  -- Finalized — Obstetric Ultrasound (Study 4 · Patient: Emma Johnson)
  insert into public.reports
    (id, clinic_id, study_id, patient_id, author_id,
     status, findings, impression, recommendations, signed_at)
  values (
    v_rep4, v_clinic_uuid, v_stu4, v_pat4, v_author_uuid,
    'finalized',
    'Single intrauterine gestation in cephalic presentation. Fetal biometry consistent with '
    '22 weeks and 3 days gestation: BPD 55 mm, HC 200 mm, AC 178 mm, FL 38 mm. '
    'Estimated fetal weight 540 g (40th percentile). Fetal cardiac activity confirmed at 148 bpm. '
    'Amniotic fluid index within normal limits at 14 cm. Placenta is anterior, grade 1, no previa. '
    'Four-chamber cardiac view, spine, abdominal wall, kidneys, and all four limbs within normal limits.',
    'Normal mid-trimester fetal anatomy survey at 22 weeks. Biometry consistent with dates.',
    'Routine antenatal follow-up. Repeat growth scan at 28–32 weeks per local protocol.',
    '2026-05-15 10:15:00+00'
  ) on conflict (id) do nothing;

  -- ── Summary ────────────────────────────────────────────────────────────────

  raise notice '──────────────────────────────────────────────────────────────';
  raise notice 'Demo data seeded successfully.';
  raise notice '';
  raise notice '  Patients  : 5';
  raise notice '  Studies   : 5  (Chest XR · CT Abdomen · Brain MRI · OB US · Knee XR)';
  raise notice '  Reports   : 4  (2 draft, 2 finalized)';
  raise notice '  Pending   : Study ACC-2026-0005 (Knee XR, no report yet)';
  raise notice '';
  raise notice '  Clinic UUID : %', v_clinic_uuid;
  raise notice '  Author UUID : %', v_author_uuid;
  raise notice '──────────────────────────────────────────────────────────────';

end;
$$;
