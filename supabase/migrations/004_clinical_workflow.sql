-- =============================================================================
-- Radiora Medical — Clinical Workflow Hardening (Phase 3)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS
-- =============================================================================

-- ─── Report Templates ─────────────────────────────────────────────────────────
-- Scoped by clinic_id. clinic_admin and radiologist can manage.
-- All clinic staff can read (for use in the report editor).

create table if not exists public.report_templates (
  id                       uuid        primary key default gen_random_uuid(),
  clinic_id                uuid        not null references public.clinics (id) on delete cascade,
  title                    text        not null,
  modality                 text,          -- null = generic (applies to any modality)
  body_part                text,
  findings_template        text        not null default '',
  impression_template      text        not null default '',
  recommendations_template text        not null default '',
  is_active                boolean     not null default true,
  created_by               uuid        references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists report_templates_clinic_idx    on public.report_templates (clinic_id);
create index if not exists report_templates_modality_idx  on public.report_templates (clinic_id, modality);

create trigger report_templates_updated_at
  before update on public.report_templates
  for each row execute function public.handle_updated_at();

alter table public.report_templates enable row level security;

drop policy if exists "report_templates: read own clinic"   on public.report_templates;
drop policy if exists "report_templates: insert"            on public.report_templates;
drop policy if exists "report_templates: update"            on public.report_templates;

create policy "report_templates: read own clinic"
  on public.report_templates for select to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

create policy "report_templates: insert"
  on public.report_templates for insert to authenticated
  with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

create policy "report_templates: update"
  on public.report_templates for update to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  )
  with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

-- ─── Report Versions ──────────────────────────────────────────────────────────
-- Immutable version snapshots. Created on every draft save, finalization,
-- and amendment. version_number is scoped per report (1, 2, 3 ...).

create table if not exists public.report_versions (
  id              uuid        primary key default gen_random_uuid(),
  report_id       uuid        not null references public.reports (id) on delete cascade,
  clinic_id       uuid        references public.clinics (id) on delete cascade,
  version_number  integer     not null,
  findings        text        not null default '',
  impression      text        not null default '',
  recommendations text,
  status          text        not null,
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  change_reason   text,
  unique (report_id, version_number)
);

create index if not exists report_versions_report_idx on public.report_versions (report_id, version_number desc);

alter table public.report_versions enable row level security;

drop policy if exists "report_versions: read own clinic"  on public.report_versions;
drop policy if exists "report_versions: insert"           on public.report_versions;

create policy "report_versions: read own clinic"
  on public.report_versions for select to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- All write-role users can insert versions (radiologist, clinic_admin, super_admin)
create policy "report_versions: insert"
  on public.report_versions for insert to authenticated
  with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    or public.is_super_admin()
  );

-- ─── AI Suggestions (Placeholder — no AI integration yet) ─────────────────────
-- TODO: Wire this table to a real AI provider (e.g., Claude API) in a future phase.
-- For now the schema and RLS structure is established so future integration
-- doesn't require breaking schema changes.

create table if not exists public.ai_suggestions (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        references public.clinics (id) on delete cascade,
  study_id        uuid        references public.studies (id) on delete cascade,
  report_id       uuid        references public.reports (id) on delete set null,
  -- pending → generated → accepted | rejected | failed
  status          text        not null default 'pending'
                              check (status in ('pending', 'generated', 'accepted', 'rejected', 'failed')),
  suggestion_type text        not null
                              check (suggestion_type in ('draft_report', 'impression', 'quality_check')),
  input_context   jsonb       not null default '{}',
  output_text     text,
  model_name      text,       -- e.g. 'claude-opus-4-7' when implemented
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  reviewed_by     uuid        references auth.users (id) on delete set null,
  reviewed_at     timestamptz
);

create index if not exists ai_suggestions_clinic_idx  on public.ai_suggestions (clinic_id);
create index if not exists ai_suggestions_study_idx   on public.ai_suggestions (study_id);
create index if not exists ai_suggestions_report_idx  on public.ai_suggestions (report_id);

alter table public.ai_suggestions enable row level security;

drop policy if exists "ai_suggestions: read own clinic"    on public.ai_suggestions;
drop policy if exists "ai_suggestions: insert own clinic"  on public.ai_suggestions;

create policy "ai_suggestions: read own clinic"
  on public.ai_suggestions for select to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

create policy "ai_suggestions: insert own clinic"
  on public.ai_suggestions for insert to authenticated
  with check (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- ─── Study status sync on report finalization ─────────────────────────────────
-- When a report transitions to 'finalized', advance the linked study's status
-- to 'reported' — unless it is already 'validated' or 'cancelled'.
-- Runs AFTER UPDATE so it sees the committed new.status value.

create or replace function public.handle_study_status_on_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finalized' and old.status <> 'finalized' then
    update public.studies
    set status = 'reported'
    where id = new.study_id
      and status in ('pending', 'in_review');
  end if;
  return null;
end;
$$;

drop trigger if exists on_report_finalized_sync_study on public.reports;

create trigger on_report_finalized_sync_study
  after update on public.reports
  for each row execute function public.handle_study_status_on_finalize();
