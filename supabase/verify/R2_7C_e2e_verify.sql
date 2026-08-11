-- R2_7C_e2e_verify.sql
-- READ-ONLY. Captures the R2.7C production-E2E closure evidence.
--
-- Run this AFTER dictating the closure phrase through the real production
-- workflow (phone or computer → STT → structuring → workspace) on the
-- TEST-R27CE2E-001 report.
--
-- Every statement is a SELECT. Nothing is written, updated or deleted.
-- The fixture is synthetic, so the output is safe to paste into the report.
--
-- The dictated phrase under test:
--   "Scanner cérébral, pas d'hémorragie intracrânienne, pas d'effet de masse,
--    présence d'une petite lésion hypodense frontale droite mesurant 8 mm,
--    je corrige 9 mm, aspect possiblement séculaire à corréler au contexte
--    clinique. Conclusion, absence d'anomalies intracrâniennes aiguës, petite
--    lésion frontale droite d'allurement probablement séculaire."

-- ── 0. Locate the E2E report ─────────────────────────────────────────────────
WITH e2e AS (
  SELECT r.id AS report_id, r.status, r.signed_at, r.structured_data, r.findings, r.impression
    FROM public.reports r
    JOIN public.patients p ON p.id = r.patient_id
   WHERE p.mrn = 'TEST-R27CE2E-001'
   ORDER BY r.created_at DESC
   LIMIT 1
)
SELECT 'REPORT' AS section, report_id::text, status, coalesce(signed_at::text, '(unsigned)') AS signed_at
  FROM e2e;

-- ── 1. GATE — RAW TRANSCRIPT IMMUTABILITY ────────────────────────────────────
-- raw_text is evidence of what was SPOKEN. It must still contain the original
-- "8 mm, je corrige 9 mm" sequence, un-rewritten.
SELECT
  'RAW IMMUTABILITY' AS gate,
  (t.raw_text LIKE '%8 mm%')                       AS raw_keeps_8mm,
  (t.raw_text ILIKE '%je corrige%')                AS raw_keeps_marker,
  (t.raw_text LIKE '%9 mm%')                       AS raw_keeps_9mm,
  length(t.raw_text)                               AS raw_len,
  t.raw_text                                       AS raw_text_verbatim
FROM public.transcriptions t
JOIN public.reports r   ON r.id = t.report_id
JOIN public.patients p  ON p.id = r.patient_id
WHERE p.mrn = 'TEST-R27CE2E-001'
ORDER BY t.created_at DESC
LIMIT 1;

-- ── 2. Corrected / working text (may differ from raw — that is the point) ────
SELECT
  'CORRECTED TEXT' AS section,
  (t.corrected_text LIKE '%9 mm%')                              AS corrected_has_9mm,
  (t.corrected_text NOT LIKE '%8 mm%')                          AS corrected_dropped_8mm,
  (t.corrected_text NOT ILIKE '%je corrige%')                   AS corrected_marker_suppressed,
  (t.corrected_text ILIKE '%aspect possiblement séculaire%')    AS corrected_keeps_continuation,
  t.corrected_text,
  t.cleaned_text
FROM public.transcriptions t
JOIN public.reports r  ON r.id = t.report_id
JOIN public.patients p ON p.id = r.patient_id
WHERE p.mrn = 'TEST-R27CE2E-001'
ORDER BY t.created_at DESC
LIMIT 1;

-- ── 3. CorrectionEvent — must be an APPLIED targeted replacement ─────────────
-- Expected: marker "je corrige", removed "8 mm", kept "9 mm", applied true.
-- The pre-R2.7C defect looked like: applied false, removed = the whole clause.
SELECT
  'CORRECTION EVENT' AS section,
  e.ord,
  e.evt ->> 'marker'  AS marker,
  e.evt ->> 'removed' AS removed,
  e.evt ->> 'kept'    AS kept,
  e.evt ->> 'applied' AS applied,
  e.evt ->> 'index'   AS idx
FROM public.transcriptions t
JOIN public.reports r  ON r.id = t.report_id
JOIN public.patients p ON p.id = r.patient_id
CROSS JOIN LATERAL jsonb_array_elements(t.correction_events) WITH ORDINALITY AS e(evt, ord)
WHERE p.mrn = 'TEST-R27CE2E-001'
ORDER BY t.created_at DESC, e.ord;

-- ── 4. Structured RÉSULTATS + CONCLUSION ─────────────────────────────────────
SELECT
  'STRUCTURED' AS section,
  (r.structured_data ->> 'results')    AS results,
  (r.structured_data ->> 'conclusion') AS conclusion,
  ((r.structured_data ->> 'results') LIKE '%9 mm%')                           AS results_has_9mm,
  ((r.structured_data ->> 'results') NOT LIKE '%8 mm%')                       AS results_dropped_8mm,
  ((r.structured_data ->> 'results') NOT ILIKE '%je corrige%')                AS results_marker_suppressed,
  ((r.structured_data ->> 'results') ILIKE '%aspect possiblement séculaire%') AS results_keeps_continuation,
  ((r.structured_data ->> 'results') ILIKE '%frontale droite%')               AS results_keeps_laterality,
  ((r.structured_data ->> 'conclusion') <> '')                                AS conclusion_present
FROM public.reports r
JOIN public.patients p ON p.id = r.patient_id
WHERE p.mrn = 'TEST-R27CE2E-001'
ORDER BY r.created_at DESC
LIMIT 1;

-- ── 5. Persisted section provenance (R2.7C(D)) ───────────────────────────────
-- After a manual edit, the edited section must read 'physician_edit'.
SELECT
  'PROVENANCE' AS section,
  r.structured_data -> 'sectionProvenance' AS section_provenance,
  (r.structured_data -> 'patient' ->> 'name') AS patient_name_in_report,
  ((r.structured_data -> 'patient' ->> 'name') <> '—')  AS patient_not_placeholder,
  ((r.structured_data -> 'patient' ->> 'age')  <> '—')  AS age_not_placeholder
FROM public.reports r
JOIN public.patients p ON p.id = r.patient_id
WHERE p.mrn = 'TEST-R27CE2E-001'
ORDER BY r.created_at DESC
LIMIT 1;

-- ── 6. Version history (must exist; signing must not erase it) ───────────────
SELECT
  'VERSIONS' AS section,
  v.version_number,
  v.action,
  v.created_at,
  (v.structured_data IS NOT NULL) AS carries_structured_snapshot
FROM public.report_versions v
JOIN public.reports r  ON r.id = v.report_id
JOIN public.patients p ON p.id = r.patient_id
WHERE p.mrn = 'TEST-R27CE2E-001'
ORDER BY v.version_number;

-- ── 7. Continued dictation (nextSourceTranscript) ────────────────────────────
-- After a SECOND dictation pass, raw_text must still open with the first
-- capture: continuation appends, it never rewrites earlier words.
SELECT
  'CONTINUATION' AS section,
  count(*) AS transcription_rows,
  max(length(t.raw_text)) AS longest_raw,
  bool_or(t.raw_text LIKE '%8 mm%je corrige%9 mm%') AS first_pass_sequence_intact
FROM public.transcriptions t
JOIN public.reports r  ON r.id = t.report_id
JOIN public.patients p ON p.id = r.patient_id
WHERE p.mrn = 'TEST-R27CE2E-001';
