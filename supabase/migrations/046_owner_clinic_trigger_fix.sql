-- 046_owner_clinic_trigger_fix.sql
-- R2.7B — repair enforce_dictation_owner_clinic() so it is safe on every
-- relation it is attached to.
--
-- ─── THE DEFECT ───────────────────────────────────────────────────────────────
-- Migration 044 attached ONE trigger function to THREE tables with different
-- ownership columns:
--
--     dictation_sessions   vacation_item_id XOR report_id
--     transcriptions       vacation_item_id XOR report_id
--     audio_assets         vacation_id      NAND report_id   ← no vacation_item_id
--
-- and guarded the queue branch like this:
--
--     if to_jsonb(new) ? 'vacation_item_id' and new.vacation_item_id is not null
--
-- That guard does not work, and cannot work. PL/pgSQL does not interpret SQL
-- expressions itself: it hands each one to the SQL parser/planner as a prepared
-- statement, and `new.vacation_item_id` is resolved against the trigger
-- relation's row type at PLAN time. Planning that expression for `audio_assets`
-- fails outright:
--
--     ERROR 42703: record "new" has no field "vacation_item_id"
--
-- The `to_jsonb(new) ? '…'` on the left never gets the chance to protect it,
-- because SQL's AND short-circuit is a RUNTIME evaluation property. An
-- expression that fails to plan never reaches runtime at all.
--
-- CREATE FUNCTION does not catch this: a plpgsql body is not validated against
-- any particular trigger relation, so 044 deployed cleanly and the fault stayed
-- dormant until something inserted into audio_assets.
--
-- ─── THE REPAIR ───────────────────────────────────────────────────────────────
-- Read every ownership column through `to_jsonb(NEW) ->> '…'`, which is a
-- RUNTIME key lookup: it is valid for any row type and simply yields NULL when
-- the key is absent. No expression in this function names a column that might
-- not exist on the relation it is running for, so no plan can fail — for these
-- three tables or any future one.
--
-- This also CLOSES A REAL GAP. Because the old queue branch could only ever run
-- on tables carrying `vacation_item_id`, `audio_assets.vacation_id` was never
-- clinic-validated at all. It is validated here.
--
-- ─── WHAT IS NOT CHANGED ──────────────────────────────────────────────────────
--   • No column is added, renamed, retyped or dropped.
--   • The ownership CHECK constraints from 044 are untouched: they, not this
--     trigger, enforce XOR / NAND. Unassigned audio (both owners NULL) still
--     inserts, as batch and long ingestion require.
--   • RLS is untouched.
--   • Migrations 001–045 are untouched. This is forward-only.
--   • Clinic isolation is strengthened, never weakened.

BEGIN;

-- ─── Pre-flight ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  FOREACH v_missing IN ARRAY ARRAY['dictation_sessions', 'transcriptions', 'audio_assets',
                                   'reports', 'vacation_items', 'vacations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_missing
    ) THEN
      RAISE EXCEPTION 'MIGRATION 046 ABORTED: required table public.% is missing.', v_missing;
    END IF;
  END LOOP;

  -- 044 must be in place: this migration repairs the function 044 created.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_dictation_owner_clinic'
  ) THEN
    RAISE EXCEPTION 'MIGRATION 046 ABORTED: enforce_dictation_owner_clinic() is missing (migration 044 not applied).';
  END IF;

  -- The ownership columns this function reads must be where 044 put them.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_assets' AND column_name = 'vacation_id'
  ) THEN
    RAISE EXCEPTION 'MIGRATION 046 ABORTED: audio_assets.vacation_id is missing.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_assets' AND column_name = 'vacation_item_id'
  ) THEN
    RAISE EXCEPTION 'MIGRATION 046 ABORTED: audio_assets unexpectedly has vacation_item_id; re-audit before applying.';
  END IF;

  RAISE NOTICE 'R2.7B pre-flight: schema is as expected.';
END $$;

-- ─── The corrected function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_dictation_owner_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Every ownership column is read as a RUNTIME jsonb lookup. `->>` on an
  -- absent key yields NULL instead of failing to plan, which is precisely what
  -- `NEW.<column>` could not do.
  v_row       jsonb := to_jsonb(new);
  v_clinic    uuid  := (v_row ->> 'clinic_id')::uuid;
  v_report    uuid  := (v_row ->> 'report_id')::uuid;
  v_item      uuid  := (v_row ->> 'vacation_item_id')::uuid;
  v_vacation  uuid  := (v_row ->> 'vacation_id')::uuid;
  v_owner     uuid;
BEGIN
  -- A dictation row without a clinic cannot be validated at all.
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Dictation row has no clinic_id' USING errcode = '23502';
  END IF;

  -- ── Report owner ────────────────────────────────────────────────────────────
  IF v_report IS NOT NULL THEN
    SELECT r.clinic_id INTO v_owner FROM public.reports r WHERE r.id = v_report;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Dictation owner report % does not exist', v_report
        USING errcode = '23503';
    END IF;
    IF v_owner IS DISTINCT FROM v_clinic THEN
      RAISE EXCEPTION 'Dictation cannot be attached to a report from another clinic'
        USING errcode = '42501';
    END IF;
  END IF;

  -- ── Queue-item owner (dictation_sessions, transcriptions) ───────────────────
  IF v_item IS NOT NULL THEN
    SELECT vi.clinic_id INTO v_owner FROM public.vacation_items vi WHERE vi.id = v_item;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Dictation owner queue item % does not exist', v_item
        USING errcode = '23503';
    END IF;
    IF v_owner IS DISTINCT FROM v_clinic THEN
      RAISE EXCEPTION 'Dictation cannot be attached to a queue item from another clinic'
        USING errcode = '42501';
    END IF;
  END IF;

  -- ── Vacation owner (audio_assets) ───────────────────────────────────────────
  -- New in 046: the old queue branch could only run on tables carrying
  -- vacation_item_id, so this ownership link was never validated.
  IF v_vacation IS NOT NULL THEN
    SELECT v.clinic_id INTO v_owner FROM public.vacations v WHERE v.id = v_vacation;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Dictation owner vacation % does not exist', v_vacation
        USING errcode = '23503';
    END IF;
    IF v_owner IS DISTINCT FROM v_clinic THEN
      RAISE EXCEPTION 'Dictation cannot be attached to a vacation from another clinic'
        USING errcode = '42501';
    END IF;
  END IF;

  RETURN new;
END $$;

COMMENT ON FUNCTION public.enforce_dictation_owner_clinic() IS
  'R2.2/R2.7B — the dictation row and its clinical owner must belong to the same clinic. RLS cannot express this because it only sees the row''s own clinic_id. Ownership columns are read via to_jsonb(NEW)->> so the function is safe on every relation it is attached to, whichever owner columns that relation has (046).';

-- ─── Triggers (re-asserted, idempotently, inside the transaction) ─────────────
-- CREATE OR REPLACE FUNCTION alone would suffice — triggers bind by OID — but
-- re-asserting them here makes 046 self-healing if one was ever dropped, with
-- no window in which a table is unguarded.
DROP TRIGGER IF EXISTS dictation_sessions_owner_clinic ON public.dictation_sessions;
CREATE TRIGGER dictation_sessions_owner_clinic
  BEFORE INSERT OR UPDATE ON public.dictation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dictation_owner_clinic();

DROP TRIGGER IF EXISTS transcriptions_owner_clinic ON public.transcriptions;
CREATE TRIGGER transcriptions_owner_clinic
  BEFORE INSERT OR UPDATE ON public.transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dictation_owner_clinic();

DROP TRIGGER IF EXISTS audio_assets_owner_clinic ON public.audio_assets;
CREATE TRIGGER audio_assets_owner_clinic
  BEFORE INSERT OR UPDATE ON public.audio_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dictation_owner_clinic();

-- ─── Self-verification ────────────────────────────────────────────────────────
-- Structural only; behavioural proof lives in
-- supabase/verify/R2_7B_owner_clinic_trigger.sql, which exercises real INSERTs
-- for every owner variant on all three tables.
DO $$
DECLARE
  v_src text;
  v_n   integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforce_dictation_owner_clinic';

  -- No direct record-field reference to a column that is absent from one of the
  -- attached relations. This is the exact shape that caused 42703.
  IF v_src ~* '\mnew\s*\.\s*vacation_item_id\M' THEN
    RAISE EXCEPTION 'MIGRATION 046 FAILED: the function still dereferences NEW.vacation_item_id.';
  END IF;
  IF v_src ~* '\mnew\s*\.\s*vacation_id\M' THEN
    RAISE EXCEPTION 'MIGRATION 046 FAILED: the function still dereferences NEW.vacation_id.';
  END IF;
  IF v_src ~* '\mnew\s*\.\s*report_id\M' THEN
    RAISE EXCEPTION 'MIGRATION 046 FAILED: the function still dereferences NEW.report_id.';
  END IF;

  -- All three owner-clinic guards must be attached.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgname IN ('dictation_sessions_owner_clinic',
                      'transcriptions_owner_clinic',
                      'audio_assets_owner_clinic');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'MIGRATION 046 FAILED: expected 3 owner-clinic triggers, found %.', v_n;
  END IF;

  RAISE NOTICE 'R2.7B: owner-clinic trigger repaired; 3 triggers attached; no unsafe field reference remains.';
END $$;

COMMIT;
