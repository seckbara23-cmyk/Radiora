-- F9 — Professional PDF/DOCX export.
-- Verification queries. Run in the Supabase SQL editor after applying migration 021.

-- 1. Branding columns exist (clinics letterhead + radiologist signature config).
SELECT table_name, column_name
FROM   information_schema.columns
WHERE  (table_name = 'clinics'  AND column_name IN ('logo_url', 'department_name', 'website', 'report_header'))
   OR  (table_name = 'profiles' AND column_name IN ('signature_title', 'signature_url', 'stamp_url'))
ORDER  BY table_name, column_name;

-- 2. Private branding bucket exists and is NOT public.
SELECT id, public, file_size_limit
FROM   storage.buckets
WHERE  id = 'clinic-branding';

-- 3. Export audit events are being recorded (one row per export action).
--    pdf_exported / docx_exported come from the route handlers; printed from the
--    print page; batch exports are pdf_exported with metadata.batch = true.
SELECT action,
       COUNT(*)                                   AS events,
       SUM((metadata ->> 'draft')::boolean::int)  AS draft_exports,
       SUM((metadata ->> 'batch')::boolean::int)  AS batch_exports
FROM   public.audit_logs
WHERE  action IN ('pdf_exported', 'docx_exported', 'printed')
GROUP  BY action
ORDER  BY action;

-- 4. Recent exports with the safe filename and the report they belong to.
SELECT created_at, action, user_id AS actor_id, entity_id AS report_id,
       metadata ->> 'filename' AS filename,
       metadata ->> 'count'    AS batch_count
FROM   public.audit_logs
WHERE  action IN ('pdf_exported', 'docx_exported', 'printed')
ORDER  BY created_at DESC
LIMIT  20;

-- 5. Tenant isolation sanity: every export audit row's report belongs to the
--    actor's clinic. This must return ZERO rows.
SELECT a.id AS audit_id
FROM   public.audit_logs a
JOIN   public.reports  r ON r.id = a.entity_id
JOIN   public.profiles p ON p.id = a.user_id
WHERE  a.action IN ('pdf_exported', 'docx_exported', 'printed')
  AND  a.entity_type = 'report'
  AND  r.clinic_id <> p.clinic_id;
