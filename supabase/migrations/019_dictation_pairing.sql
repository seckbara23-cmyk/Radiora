-- 019_dictation_pairing.sql
-- FEATURE 3 — Phone as a remote dictation device.
--
-- The desktop opens a report and creates a short-lived *dictation session*; its
-- token is shown as a QR code. The radiologist's phone scans it and becomes a
-- wireless microphone — it records locally and uploads the audio straight onto
-- the vacation item. No dictaphone, no USB.
--
-- Security model:
--   * The token is an unguessable capability, scoped to ONE vacation_item, and
--     expires (default 30 min). The phone never logs in.
--   * The phone-side upload runs through the service-role client SERVER-SIDE only
--     (validating the token + expiry in code); the key is never sent to the phone.
--   * Audio still lands in the private, clinic-scoped dictation-audio bucket.

-- ─── Status enum ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dictation_session_status') THEN
    CREATE TYPE public.dictation_session_status AS ENUM (
      'pending',     -- QR shown, phone not yet connected
      'connected',   -- phone opened the link
      'recording',   -- phone is capturing audio
      'completed',   -- audio uploaded
      'expired',     -- TTL passed
      'cancelled'    -- desktop cancelled
    );
  END IF;
END $$;

-- ─── dictation_sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dictation_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES public.clinics(id)        ON DELETE CASCADE,
  vacation_item_id uuid NOT NULL REFERENCES public.vacation_items(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  token            text NOT NULL UNIQUE,
  status           public.dictation_session_status NOT NULL DEFAULT 'pending',
  device_label     text,
  audio_asset_id   uuid REFERENCES public.audio_assets(id) ON DELETE SET NULL,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dictation_sessions_token_idx     ON public.dictation_sessions(token);
CREATE INDEX IF NOT EXISTS dictation_sessions_item_idx      ON public.dictation_sessions(vacation_item_id);
CREATE INDEX IF NOT EXISTS dictation_sessions_clinic_idx    ON public.dictation_sessions(clinic_id);

DROP TRIGGER IF EXISTS dictation_sessions_updated_at ON public.dictation_sessions;
CREATE TRIGGER dictation_sessions_updated_at
  BEFORE UPDATE ON public.dictation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── RLS — dictation_sessions (desktop side) ──────────────────────────────────
-- The phone side reads/writes via the service-role client (token-validated in
-- code), so RLS here only governs the authenticated desktop user.
ALTER TABLE public.dictation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dictation_sessions_select"          ON public.dictation_sessions;
DROP POLICY IF EXISTS "dictation_sessions_write"           ON public.dictation_sessions;
DROP POLICY IF EXISTS "dictation_sessions_super_admin_all" ON public.dictation_sessions;

CREATE POLICY "dictation_sessions_select" ON public.dictation_sessions
  FOR SELECT USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'))
  );

CREATE POLICY "dictation_sessions_write" ON public.dictation_sessions
  FOR ALL
  USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  )
  WITH CHECK (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  );

CREATE POLICY "dictation_sessions_super_admin_all" ON public.dictation_sessions
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── Broaden the audio bucket for phone-recorded formats ──────────────────────
-- Browser MediaRecorder emits webm (Android/Chrome) or mp4 (iOS/Safari); add the
-- recording container types so phone uploads aren't rejected at the storage layer.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/x-wav',
  'audio/wave', 'audio/vnd.wave', 'audio/m4a', 'audio/x-m4a', 'video/mp4',
  'audio/webm', 'video/webm', 'audio/ogg', 'application/octet-stream'
]
WHERE id = 'dictation-audio';
