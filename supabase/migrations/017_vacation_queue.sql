-- 017_vacation_queue.sql
-- FEATURE 1 — Vacation Audio Queue.
--
-- Models Dr BA's high-volume reporting days (Mon CT, Tue US, Wed MRI, Thu XR).
-- A "vacation" is one such session; each patient in it is a "vacation_item" that
-- moves through an 8-state workflow from audio reception to export.
--
-- Medical-safety invariants enforced at the DB layer (defence in depth — the
-- action layer enforces the same):
--   * Only a radiologist (or admin) may move an item to 'validated' / 'signed'.
--   * An item can only reach 'exported' after it has been 'signed' (physician
--     validation is mandatory before export).

-- ─── Workflow status enum ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vacation_workflow_status') THEN
    CREATE TYPE public.vacation_workflow_status AS ENUM (
      'audio_received',      -- Audio reçu
      'transcribing',        -- Transcription en cours
      'secretary_review',    -- À relire secrétaire
      'radiologist_review',  -- À valider radiologue
      'validated',           -- Validé
      'signed',              -- Signé
      'printed',             -- Imprimé
      'exported'             -- Exporté
    );
  END IF;
END $$;

-- ─── vacations (a reporting session) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vacations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  radiologist_id uuid REFERENCES public.profiles(id)          ON DELETE SET NULL,
  title          text NOT NULL,
  modality       text NOT NULL CHECK (modality IN ('CT','MRI','XR','US','NM','PT','MG','DX','CR')),
  vacation_date  date NOT NULL,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes          text,
  created_by     uuid NOT NULL REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacations_clinic_id_idx   ON public.vacations(clinic_id);
CREATE INDEX IF NOT EXISTS vacations_date_idx        ON public.vacations(vacation_date DESC);
CREATE INDEX IF NOT EXISTS vacations_modality_idx    ON public.vacations(clinic_id, modality);
CREATE INDEX IF NOT EXISTS vacations_radiologist_idx ON public.vacations(radiologist_id);

DROP TRIGGER IF EXISTS vacations_updated_at ON public.vacations;
CREATE TRIGGER vacations_updated_at
  BEFORE UPDATE ON public.vacations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── vacation_items (one patient / one report in the queue) ───────────────────
-- patient_id / study_id / report_id are nullable so an audio file can enter the
-- queue before it has been matched to a patient or turned into a report (batch
-- and long-recording ingestion in Feature 2). audio_asset_id is added later by
-- the Feature 2 migration.
CREATE TABLE IF NOT EXISTS public.vacation_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                uuid NOT NULL REFERENCES public.clinics(id)   ON DELETE CASCADE,
  vacation_id              uuid NOT NULL REFERENCES public.vacations(id) ON DELETE CASCADE,
  patient_id               uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  study_id                 uuid REFERENCES public.studies(id)  ON DELETE SET NULL,
  report_id                uuid REFERENCES public.reports(id)  ON DELETE SET NULL,
  patient_label            text,        -- fallback label before patient is matched (e.g. "Patient 12")
  exam_number              text,        -- the exam number from the paper/Word workflow
  position                 integer NOT NULL DEFAULT 0,
  workflow_status          public.vacation_workflow_status NOT NULL DEFAULT 'audio_received',
  assigned_secretary_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_radiologist_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by               uuid NOT NULL REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacation_items_clinic_id_idx   ON public.vacation_items(clinic_id);
CREATE INDEX IF NOT EXISTS vacation_items_vacation_id_idx  ON public.vacation_items(vacation_id);
CREATE INDEX IF NOT EXISTS vacation_items_status_idx       ON public.vacation_items(workflow_status);
CREATE INDEX IF NOT EXISTS vacation_items_report_id_idx    ON public.vacation_items(report_id);
CREATE INDEX IF NOT EXISTS vacation_items_position_idx     ON public.vacation_items(vacation_id, position);

DROP TRIGGER IF EXISTS vacation_items_updated_at ON public.vacation_items;
CREATE TRIGGER vacation_items_updated_at
  BEFORE UPDATE ON public.vacation_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Validation-authority trigger (medical safety) ────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_vacation_validation_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean := (TG_OP = 'INSERT')
                       OR (NEW.workflow_status IS DISTINCT FROM OLD.workflow_status);
BEGIN
  -- Only a radiologist / admin may validate or sign. A secretary never can.
  IF v_changed
     AND NEW.workflow_status IN ('validated', 'signed')
     AND public.get_current_user_role() NOT IN ('radiologist', 'clinic_admin', 'super_admin') THEN
    RAISE EXCEPTION
      'Only a radiologist can validate or sign a report (attempted workflow_status=%).',
      NEW.workflow_status;
  END IF;

  -- Physician validation is mandatory before export: an item can only reach
  -- 'exported' from a signed (or already printed/exported) state.
  IF v_changed
     AND NEW.workflow_status = 'exported'
     AND COALESCE(OLD.workflow_status::text, '') NOT IN ('signed', 'printed', 'exported') THEN
    RAISE EXCEPTION
      'A report must be signed by a radiologist before it can be exported.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vacation_items_validation_authority ON public.vacation_items;
CREATE TRIGGER vacation_items_validation_authority
  BEFORE INSERT OR UPDATE ON public.vacation_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vacation_validation_authority();

-- ─── RLS — vacations ──────────────────────────────────────────────────────────
ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vacations_select"          ON public.vacations;
DROP POLICY IF EXISTS "vacations_write"           ON public.vacations;
DROP POLICY IF EXISTS "vacations_super_admin_all" ON public.vacations;

CREATE POLICY "vacations_select" ON public.vacations
  FOR SELECT USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'))
  );

CREATE POLICY "vacations_write" ON public.vacations
  FOR ALL
  USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  )
  WITH CHECK (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  );

CREATE POLICY "vacations_super_admin_all" ON public.vacations
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── RLS — vacation_items ─────────────────────────────────────────────────────
ALTER TABLE public.vacation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vacation_items_select"          ON public.vacation_items;
DROP POLICY IF EXISTS "vacation_items_write"           ON public.vacation_items;
DROP POLICY IF EXISTS "vacation_items_super_admin_all" ON public.vacation_items;

CREATE POLICY "vacation_items_select" ON public.vacation_items
  FOR SELECT USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'))
  );

-- Row-level write is open to clinic staff; the *which-status-by-whom* rules are
-- enforced by enforce_vacation_validation_authority() above and the action layer.
CREATE POLICY "vacation_items_write" ON public.vacation_items
  FOR ALL
  USING (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  )
  WITH CHECK (
    (clinic_id = get_current_user_clinic_id())
    AND (get_current_user_role() IN ('clinic_admin', 'radiologist', 'secretary', 'super_admin'))
  );

CREATE POLICY "vacation_items_super_admin_all" ON public.vacation_items
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
