-- 045_transcription_runs.sql
-- R2.7A — automatic speech-to-text for phone and imported audio.
--
-- WHY A MIGRATION IS REQUIRED
--   R2.7A needs three things the current schema cannot express:
--
--   1. A PROCESSING lifecycle. `transcriptions.status` is the REVIEW state
--      ('draft' | 'secretary_reviewed' | 'radiologist_reviewed') — a human
--      workflow, not a job state. Overloading it would corrupt an existing
--      meaning. `audio_assets.status` ('uploaded' | 'assigned' | 'transcribed' |
--      'archived') has no in-progress and no failed state, and extending a
--      Postgres enum is not cleanly transaction-safe.
--   2. An ATOMIC CLAIM. Serverless means the same transcription can be invoked
--      twice — a double click, a retry, a platform re-invocation. Exactly one
--      worker must own an audio asset's transcription, and there is no column
--      today that can carry a compare-and-set.
--   3. PER-PASS PROVENANCE. A report may be dictated in several passes (R2.7).
--      Each pass has its own audio asset, and the doctor must be able to see
--      which recording produced which words, including for passes that failed.
--
-- WHAT THIS ADDS
--   One append-only table. Migrations 001–044 are untouched: no column is
--   dropped, altered or re-typed, and no existing row is modified.
--
--   The claim is a PARTIAL UNIQUE INDEX rather than an UPDATE, because an index
--   makes the race impossible rather than merely unlikely: two concurrent
--   workers both INSERT, Postgres lets exactly one succeed, and the loser gets
--   a unique violation it can detect without ever calling the provider.
--
--   `status` is text + CHECK rather than an enum, so a future state can be
--   added inside an ordinary transaction.
--
-- SAFETY
--   • raw_text here is the provider's transcript verbatim — provenance, never
--     rewritten. Cleanup and correction happen downstream in runStructuring.
--   • No provider key, no storage URL and no patient identifier is stored.
--   • RLS is clinic-scoped exactly like transcriptions/dictation_sessions.

BEGIN;

-- ─── Pre-flight ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  -- Everything this table references must already exist; a missing dependency
  -- means the database is not what this migration was written against.
  FOREACH v_missing IN ARRAY ARRAY['clinics', 'transcriptions', 'audio_assets', 'reports'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_missing
    ) THEN
      RAISE EXCEPTION 'MIGRATION 045 ABORTED: required table public.% is missing.', v_missing;
    END IF;
  END LOOP;

  -- R2.2/044 gave transcriptions a report owner. Without it there is nothing to
  -- attach a report-owned transcription run to.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transcriptions' AND column_name = 'report_id'
  ) THEN
    RAISE EXCEPTION 'MIGRATION 045 ABORTED: migration 044 has not been applied (transcriptions.report_id missing).';
  END IF;

  RAISE NOTICE 'R2.7A pre-flight: dependencies present.';
END $$;

-- ─── transcription_runs ───────────────────────────────────────────────────────
-- One row per attempt to transcribe one audio asset. Append-only: a failed run
-- stays for audit, and a retry inserts a new row rather than mutating history.
CREATE TABLE IF NOT EXISTS public.transcription_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES public.clinics(id)        ON DELETE CASCADE,
  transcription_id uuid NOT NULL REFERENCES public.transcriptions(id) ON DELETE CASCADE,
  audio_asset_id   uuid NOT NULL REFERENCES public.audio_assets(id)   ON DELETE CASCADE,
  report_id        uuid REFERENCES public.reports(id)                 ON DELETE CASCADE,

  status           text NOT NULL DEFAULT 'processing'
                     CHECK (status IN ('processing', 'completed', 'failed')),

  -- How the audio got here: which microphone, not which patient.
  source           text CHECK (source IN ('phone', 'import')),

  -- Provider identity is operational metadata, never a secret.
  provider         text,
  model            text,
  language         text,

  -- The provider's transcript, verbatim. Provenance: never cleaned here.
  raw_text         text NOT NULL DEFAULT '',

  -- A safe internal category ('not_configured', 'timeout', 'auth', …), never a
  -- raw provider response body.
  error_code       text,

  audio_bytes      bigint,
  audio_mime       text,
  duration_ms      integer,

  claimed_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── The claim ────────────────────────────────────────────────────────────────
-- At most ONE live-or-successful run per audio asset. A concurrent second
-- worker's INSERT raises 23505 and it stops before spending a provider call.
-- Failed runs are excluded, so an explicit retry is always possible; completed
-- runs are included, so a finished transcript is never silently redone.
CREATE UNIQUE INDEX IF NOT EXISTS transcription_runs_active_uidx
  ON public.transcription_runs (audio_asset_id)
  WHERE status IN ('processing', 'completed');

CREATE INDEX IF NOT EXISTS transcription_runs_clinic_idx     ON public.transcription_runs(clinic_id);
CREATE INDEX IF NOT EXISTS transcription_runs_report_idx     ON public.transcription_runs(report_id);
CREATE INDEX IF NOT EXISTS transcription_runs_transcript_idx ON public.transcription_runs(transcription_id);

DROP TRIGGER IF EXISTS transcription_runs_updated_at ON public.transcription_runs;
CREATE TRIGGER transcription_runs_updated_at
  BEFORE UPDATE ON public.transcription_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Clinic isolation ─────────────────────────────────────────────────────────
-- A transcription run must belong to the same clinic as the audio it
-- transcribes. RLS alone cannot prove this: it only sees the row's own
-- clinic_id, not the asset's. Same reasoning as migration 044's owner trigger.
CREATE OR REPLACE FUNCTION public.enforce_transcription_run_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset_clinic      uuid;
  v_transcript_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_asset_clinic      FROM public.audio_assets   WHERE id = NEW.audio_asset_id;
  SELECT clinic_id INTO v_transcript_clinic FROM public.transcriptions WHERE id = NEW.transcription_id;

  IF v_asset_clinic IS NULL OR v_asset_clinic <> NEW.clinic_id THEN
    RAISE EXCEPTION 'transcription_runs: audio asset belongs to a different clinic';
  END IF;

  IF v_transcript_clinic IS NULL OR v_transcript_clinic <> NEW.clinic_id THEN
    RAISE EXCEPTION 'transcription_runs: transcription belongs to a different clinic';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS transcription_runs_clinic_guard ON public.transcription_runs;
CREATE TRIGGER transcription_runs_clinic_guard
  BEFORE INSERT OR UPDATE OF clinic_id, audio_asset_id, transcription_id
  ON public.transcription_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transcription_run_clinic();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Same shape as dictation_sessions: the desktop reads through the user session,
-- the server-side transcription worker writes through the service role.
ALTER TABLE public.transcription_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transcription_runs_select"          ON public.transcription_runs;
DROP POLICY IF EXISTS "transcription_runs_write"           ON public.transcription_runs;
DROP POLICY IF EXISTS "transcription_runs_super_admin_all" ON public.transcription_runs;

CREATE POLICY "transcription_runs_select" ON public.transcription_runs
  FOR SELECT USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'))
  );

CREATE POLICY "transcription_runs_write" ON public.transcription_runs
  FOR ALL
  USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  )
  WITH CHECK (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  );

CREATE POLICY "transcription_runs_super_admin_all" ON public.transcription_runs
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

COMMIT;
