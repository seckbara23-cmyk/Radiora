-- =============================================================================
-- Radiora Medical — Phase 3 Safety Fixes
-- =============================================================================
-- Prerequisite: 004_clinical_workflow.sql must already be applied.
-- All statements are idempotent and safe to re-run.
-- =============================================================================

-- ── 1. Fix RLS policy precedence in report_versions: insert ──────────────────
--
-- Migration 004 created this WITH CHECK clause:
--
--   clinic_id = get_current_user_clinic_id()
--   and get_current_user_role() in (...)
--   or is_super_admin()
--
-- SQL operator precedence evaluates AND before OR, so the clause is logically
-- correct, but the implicit grouping is easy to misread during future audits.
-- Explicit parentheses make the intent unambiguous.

drop policy if exists "report_versions: insert" on public.report_versions;

create policy "report_versions: insert"
  on public.report_versions for insert to authenticated
  with check (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ── 2. Trigger recreation safety for report_templates_updated_at ─────────────
--
-- Migration 004 used CREATE TRIGGER without a prior DROP IF EXISTS guard.
-- Drop and recreate so this migration is fully idempotent on its own and
-- leaves the trigger in a known-good state regardless of prior run history.

drop trigger if exists report_templates_updated_at on public.report_templates;

create trigger report_templates_updated_at
  before update on public.report_templates
  for each row execute function public.handle_updated_at();
