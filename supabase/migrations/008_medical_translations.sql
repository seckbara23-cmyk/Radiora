-- =============================================================================
-- Radiora Medical — Phase 4C Medical Translation Foundation
-- =============================================================================
-- Prerequisite: 007_patient_explanations.sql must already be applied.
-- All statements are idempotent and safe to re-run.
-- No external translation API calls — local dictionary engine only.
-- =============================================================================

-- ── report_translations ───────────────────────────────────────────────────────
-- Stores translated versions of finalized reports and/or approved patient
-- explanations. Translations are always separate from the source — originals
-- are never modified.

create table if not exists public.report_translations (
  id                       uuid        primary key default gen_random_uuid(),
  clinic_id                uuid        references public.clinics(id) on delete cascade,

  -- Exactly one of these must be non-null (enforced by constraint below).
  report_id                uuid        references public.reports(id) on delete cascade,
  patient_explanation_id   uuid        references public.patient_explanations(id) on delete cascade,

  source_language          text        not null default 'en',
  target_language          text        not null,

  status                   text        not null default 'draft'
                                       check (status in ('draft', 'approved', 'rejected', 'archived')),

  -- Clinical report fields (populated when report_id is set)
  translated_title         text,
  translated_findings      text,
  translated_impression    text,
  translated_recommendations text,

  -- Patient explanation field (populated when patient_explanation_id is set)
  translated_explanation   text,
  disclaimer               text,

  source_version_id        uuid        references public.report_versions(id) on delete set null,

  created_by               uuid        references auth.users(id) on delete set null,
  approved_by              uuid        references auth.users(id) on delete set null,
  approved_at              timestamptz,
  rejected_by              uuid        references auth.users(id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- At least one source must be specified
  constraint report_translations_source_check
    check (report_id is not null or patient_explanation_id is not null)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists report_translations_report_id_idx
  on public.report_translations (report_id);
create index if not exists report_translations_explanation_id_idx
  on public.report_translations (patient_explanation_id);
create index if not exists report_translations_clinic_id_idx
  on public.report_translations (clinic_id);
create index if not exists report_translations_status_idx
  on public.report_translations (status);
create index if not exists report_translations_lang_idx
  on public.report_translations (source_language, target_language);

-- ── updated_at trigger ────────────────────────────────────────────────────────

drop trigger if exists report_translations_updated_at on public.report_translations;

create trigger report_translations_updated_at
  before update on public.report_translations
  for each row execute function public.handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.report_translations enable row level security;

-- select: clinic_admin + radiologist manage translations; technician/viewer have no access
drop policy if exists "report_translations: select" on public.report_translations;
create policy "report_translations: select"
  on public.report_translations for select to authenticated
  using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- insert: clinic_admin + radiologist only
drop policy if exists "report_translations: insert" on public.report_translations;
create policy "report_translations: insert"
  on public.report_translations for insert to authenticated
  with check (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- update: clinic_admin + radiologist can approve/reject/archive
drop policy if exists "report_translations: update" on public.report_translations;
create policy "report_translations: update"
  on public.report_translations for update to authenticated
  using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );
