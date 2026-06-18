-- F8 — Automatic report creation from the vacation queue.
-- Verification queries. Run in the Supabase SQL editor (service role) to confirm
-- the feature behaves correctly. No schema changes — F8 is code-only.

-- 1. Queue items eligible for "Créer le compte rendu":
--    matched to a patient, but no report linked yet.
SELECT vi.id AS queue_item_id, vi.patient_id, vi.report_id, vi.workflow_status, v.title, v.modality
FROM   public.vacation_items vi
JOIN   public.vacations v ON v.id = vi.vacation_id
WHERE  vi.report_id IS NULL
  AND  vi.patient_id IS NOT NULL
ORDER  BY vi.created_at DESC;

-- 2. After clicking "Créer le compte rendu", confirm the item is now linked and
--    the report is a structured HPD draft (structured_data present, exam_type set).
--    Replace :item_id.
SELECT vi.id            AS queue_item_id,
       vi.report_id,
       vi.study_id,
       r.status,
       r.exam_type,
       (r.structured_data IS NOT NULL)              AS has_structured_data,
       r.structured_data ->> 'examTitle'            AS exam_title,
       r.structured_data ->> 'language'             AS language,
       r.structured_data -> 'patient' ->> 'name'    AS patient_name
FROM   public.vacation_items vi
JOIN   public.reports r ON r.id = vi.report_id
WHERE  vi.id = ':item_id';

-- 3. Duplicate guard: no report should be referenced by more than one queue item,
--    and creating twice must not yield two reports for one item.
--    This must return ZERO rows.
SELECT report_id, COUNT(*) AS linked_items
FROM   public.vacation_items
WHERE  report_id IS NOT NULL
GROUP  BY report_id
HAVING COUNT(*) > 1;

-- 4. Audit trail: every creation logs action 'report_created_from_queue' with the
--    queue_item_id, report_id, and actor_id in metadata.
SELECT created_at, user_id AS actor_id, entity_id AS report_id,
       metadata ->> 'queueItemId' AS queue_item_id,
       metadata ->> 'studyId'     AS study_id
FROM   public.audit_logs
WHERE  action = 'report_created_from_queue'
ORDER  BY created_at DESC
LIMIT  20;

-- 5. Tenant isolation: the report, study, patient and queue item created together
--    must all share the same clinic_id. This must return ZERO rows.
SELECT vi.id AS queue_item_id
FROM   public.vacation_items vi
JOIN   public.reports  r ON r.id = vi.report_id
JOIN   public.studies  s ON s.id = r.study_id
JOIN   public.patients p ON p.id = r.patient_id
WHERE  vi.report_id IS NOT NULL
  AND (r.clinic_id <> vi.clinic_id
    OR s.clinic_id <> vi.clinic_id
    OR p.clinic_id <> vi.clinic_id);
