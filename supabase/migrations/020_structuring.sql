-- 020_structuring.sql
-- FEATURE 7 — AI structuring engine (deterministic, local).
--
-- Preserve the four data layers on the transcription row:
--   Layer 1 raw_audio        → audio_assets.storage_path (already linked)
--   Layer 2 raw_transcript   → transcriptions.raw_text   (existing)
--   Layer 3 cleaned_transcript → transcriptions.cleaned_text   (NEW)
--   Layer 4 structured_report  → transcriptions.structured_json (NEW)
--
-- Plus the audit trail of what the engine did: the dictated self-corrections it
-- resolved and the per-section confidence it assigned.

ALTER TABLE public.transcriptions
  ADD COLUMN IF NOT EXISTS cleaned_text      text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS correction_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS structured_json   jsonb,
  ADD COLUMN IF NOT EXISTS confidence        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS structured_at     timestamptz,
  ADD COLUMN IF NOT EXISTS structured_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- No new RLS needed: these columns inherit the existing transcriptions policies
-- (clinic-scoped select/write for clinic_admin/radiologist/secretary/super_admin).
