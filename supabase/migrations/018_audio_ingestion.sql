-- 018_audio_ingestion.sql
-- FEATURE 2 (audio ingestion) + FEATURE 6 (transcription record).
--
-- Replaces the dictaphone -> USB -> Word loop. A dictation audio file is ingested,
-- stored PRIVATELY in Supabase Storage, attached to a vacation_item, and given a
-- transcription record.
--
-- Medical-safety / privacy invariants:
--   * NO external speech-to-text provider is ever called by the database. The
--     transcript is authored / edited by clinic staff and stays editable.
--   * Audio is clinic-scoped at the Storage layer (path = <clinic_id>/<file>) and
--     never public. PHI never leaves the tenant boundary.
--   * Physician validation remains mandatory before export (enforced in 017).

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audio_ingestion_mode') THEN
    CREATE TYPE public.audio_ingestion_mode AS ENUM ('single', 'batch', 'long');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audio_asset_status') THEN
    CREATE TYPE public.audio_asset_status AS ENUM ('uploaded', 'assigned', 'transcribed', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transcription_status') THEN
    CREATE TYPE public.transcription_status AS ENUM ('draft', 'secretary_reviewed', 'radiologist_reviewed');
  END IF;
END $$;

-- ─── audio_assets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audio_assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  vacation_id       uuid REFERENCES public.vacations(id)         ON DELETE SET NULL,
  uploaded_by       uuid NOT NULL REFERENCES auth.users(id),
  original_filename text NOT NULL,
  mime_type         text NOT NULL,
  file_size_bytes   bigint NOT NULL DEFAULT 0,
  duration_seconds  numeric,
  storage_path      text NOT NULL,                 -- <clinic_id>/<asset_id>.<ext> in the dictation-audio bucket
  ingestion_mode    public.audio_ingestion_mode NOT NULL DEFAULT 'single',
  status            public.audio_asset_status   NOT NULL DEFAULT 'uploaded',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audio_assets_clinic_id_idx   ON public.audio_assets(clinic_id);
CREATE INDEX IF NOT EXISTS audio_assets_vacation_id_idx  ON public.audio_assets(vacation_id);
CREATE INDEX IF NOT EXISTS audio_assets_status_idx       ON public.audio_assets(status);

DROP TRIGGER IF EXISTS audio_assets_updated_at ON public.audio_assets;
CREATE TRIGGER audio_assets_updated_at
  BEFORE UPDATE ON public.audio_assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── vacation_items.audio_asset_id (the column 017 promised) ──────────────────
ALTER TABLE public.vacation_items
  ADD COLUMN IF NOT EXISTS audio_asset_id uuid REFERENCES public.audio_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vacation_items_audio_asset_idx ON public.vacation_items(audio_asset_id);

-- ─── transcriptions (one editable transcript per queue item) ──────────────────
-- raw_text  = what was first captured (upload note / dictated draft).
-- corrected_text = the staff-edited working text. Both stay editable until the
-- radiologist validates. The DB never populates these from an external STT API.
CREATE TABLE IF NOT EXISTS public.transcriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES public.clinics(id)        ON DELETE CASCADE,
  vacation_item_id uuid NOT NULL REFERENCES public.vacation_items(id) ON DELETE CASCADE,
  audio_asset_id   uuid REFERENCES public.audio_assets(id)            ON DELETE SET NULL,
  language         text NOT NULL DEFAULT 'fr',
  raw_text         text NOT NULL DEFAULT '',
  corrected_text   text NOT NULL DEFAULT '',
  status           public.transcription_status NOT NULL DEFAULT 'draft',
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vacation_item_id)
);

CREATE INDEX IF NOT EXISTS transcriptions_clinic_id_idx ON public.transcriptions(clinic_id);
CREATE INDEX IF NOT EXISTS transcriptions_status_idx     ON public.transcriptions(status);

DROP TRIGGER IF EXISTS transcriptions_updated_at ON public.transcriptions;
CREATE TRIGGER transcriptions_updated_at
  BEFORE UPDATE ON public.transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── RLS — audio_assets ───────────────────────────────────────────────────────
ALTER TABLE public.audio_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audio_assets_select"          ON public.audio_assets;
DROP POLICY IF EXISTS "audio_assets_write"           ON public.audio_assets;
DROP POLICY IF EXISTS "audio_assets_super_admin_all" ON public.audio_assets;

CREATE POLICY "audio_assets_select" ON public.audio_assets
  FOR SELECT USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'))
  );

CREATE POLICY "audio_assets_write" ON public.audio_assets
  FOR ALL
  USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  )
  WITH CHECK (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  );

CREATE POLICY "audio_assets_super_admin_all" ON public.audio_assets
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── RLS — transcriptions ─────────────────────────────────────────────────────
ALTER TABLE public.transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transcriptions_select"          ON public.transcriptions;
DROP POLICY IF EXISTS "transcriptions_write"           ON public.transcriptions;
DROP POLICY IF EXISTS "transcriptions_super_admin_all" ON public.transcriptions;

CREATE POLICY "transcriptions_select" ON public.transcriptions
  FOR SELECT USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'))
  );

CREATE POLICY "transcriptions_write" ON public.transcriptions
  FOR ALL
  USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  )
  WITH CHECK (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  );

CREATE POLICY "transcriptions_super_admin_all" ON public.transcriptions
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── Storage bucket (private) ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dictation-audio',
  'dictation-audio',
  false,
  104857600,  -- 100 MB
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/x-wav',
    'audio/wave', 'audio/vnd.wave', 'audio/m4a', 'audio/x-m4a', 'video/mp4',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each object's first path segment is the owning clinic_id. Staff may
-- read/write only their own clinic's audio; the bucket is never public.
DROP POLICY IF EXISTS "dictation_audio_select" ON storage.objects;
DROP POLICY IF EXISTS "dictation_audio_insert" ON storage.objects;
DROP POLICY IF EXISTS "dictation_audio_delete" ON storage.objects;

CREATE POLICY "dictation_audio_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dictation-audio'
    AND (storage.foldername(name))[1] = public.get_current_user_clinic_id()::text
    AND public.get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin')
  );

CREATE POLICY "dictation_audio_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dictation-audio'
    AND (storage.foldername(name))[1] = public.get_current_user_clinic_id()::text
    AND public.get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin')
  );

CREATE POLICY "dictation_audio_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dictation-audio'
    AND (storage.foldername(name))[1] = public.get_current_user_clinic_id()::text
    AND public.get_current_user_role() IN ('clinic_admin', 'radiologist', 'super_admin')
  );
