-- 021_report_branding.sql
-- FEATURE 9 (professional PDF/DOCX export).
--
-- Adds the optional branding + signature configuration that the export renderer
-- consumes to make a generated report look like a real hospital document instead
-- of a generic web page. Everything here is OPTIONAL: when a field is null the
-- renderer falls back to plain text (clinic name, "Le Radiologue", etc.), so the
-- export feature works with zero configuration and degrades gracefully.
--
-- Medical-safety / privacy invariants (unchanged):
--   * Branding assets (logo / signature / stamp) live PRIVATELY in Storage,
--     clinic-scoped by path (<clinic_id>/<file>), never public.
--   * Export NEVER alters clinical content — these columns are presentation only.
--   * Physician validation still governs whether an export is "final" vs a
--     BROUILLON draft (decided by reports.signed_at at render time, not here).

-- ─── clinics: hospital / service letterhead ──────────────────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS logo_url        text,   -- storage path in clinic-branding OR external https URL
  ADD COLUMN IF NOT EXISTS department_name text,   -- e.g. "Service de Radiologie et Imagerie Médicale"
  ADD COLUMN IF NOT EXISTS website         text,
  ADD COLUMN IF NOT EXISTS report_header   text;   -- optional override for the top hospital line

-- ─── profiles: radiologist signature block ───────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_title text,   -- e.g. "Médecin Radiologue"
  ADD COLUMN IF NOT EXISTS signature_url   text,   -- storage path / https URL of a signature image
  ADD COLUMN IF NOT EXISTS stamp_url       text;   -- storage path / https URL of an official stamp image

-- ─── Storage bucket (private) for branding assets ────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-branding',
  'clinic-branding',
  false,
  5242880,  -- 5 MB; logos / signatures / stamps are small
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each object's first path segment is the owning clinic_id. Staff may
-- read their own clinic's branding; only clinic admins may upload / delete it.
DROP POLICY IF EXISTS "clinic_branding_select" ON storage.objects;
DROP POLICY IF EXISTS "clinic_branding_insert" ON storage.objects;
DROP POLICY IF EXISTS "clinic_branding_delete" ON storage.objects;

CREATE POLICY "clinic_branding_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinic-branding'
    AND (storage.foldername(name))[1] = public.get_current_user_clinic_id()::text
    AND public.get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin')
  );

CREATE POLICY "clinic_branding_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-branding'
    AND (storage.foldername(name))[1] = public.get_current_user_clinic_id()::text
    AND public.get_current_user_role() IN ('clinic_admin', 'super_admin')
  );

CREATE POLICY "clinic_branding_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinic-branding'
    AND (storage.foldername(name))[1] = public.get_current_user_clinic_id()::text
    AND public.get_current_user_role() IN ('clinic_admin', 'super_admin')
  );
