-- ─── External AI Results (Phase 4E) ──────────────────────────────────────────
-- Stores imported external AI image analysis results and per-finding decisions.
-- No DICOM parsing yet — manual_entry and mock payloads for foundation.
-- Human clinician review is mandatory; no automatic diagnosis or finalization.

-- ── A) external_ai_results ────────────────────────────────────────────────────
create table if not exists public.external_ai_results (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,
  study_id             uuid not null references public.studies(id) on delete cascade,
  report_id            uuid references public.reports(id) on delete set null,

  source_type          text not null default 'manual_entry'
                         check (source_type in (
                           'dicom_sr',
                           'vendor_json',
                           'manual_entry',
                           'future_pacs_integration'
                         )),
  vendor_name          text,
  model_name           text,
  model_version        text,

  status               text not null default 'imported'
                         check (status in (
                           'imported',
                           'reviewed',
                           'accepted',
                           'rejected',
                           'archived'
                         )),

  overall_confidence   numeric check (overall_confidence >= 0 and overall_confidence <= 100),
  raw_payload          jsonb not null default '{}',
  summary_text         text,

  created_by           uuid not null references auth.users(id),
  reviewed_by          uuid references auth.users(id),
  reviewed_at          timestamptz,
  rejection_reason     text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── B) external_ai_findings ───────────────────────────────────────────────────
create table if not exists public.external_ai_findings (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references public.clinics(id) on delete cascade,
  external_ai_result_id  uuid not null references public.external_ai_results(id) on delete cascade,
  study_id               uuid not null references public.studies(id) on delete cascade,

  finding_type           text,
  finding_label          text not null,
  body_region            text,
  laterality             text check (laterality in ('left', 'right', 'bilateral', 'midline') or laterality is null),
  confidence             numeric check (confidence >= 0 and confidence <= 100),

  severity               text check (severity in ('low', 'moderate', 'high', 'critical') or severity is null),
  recommendation         text,

  -- Clinician decision
  accepted               boolean,
  accepted_by            uuid references auth.users(id),
  accepted_at            timestamptz,
  rejected_by            uuid references auth.users(id),
  rejected_at            timestamptz,
  rejection_reason       text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists external_ai_results_clinic_id_idx   on public.external_ai_results(clinic_id);
create index if not exists external_ai_results_study_id_idx    on public.external_ai_results(study_id);
create index if not exists external_ai_results_report_id_idx   on public.external_ai_results(report_id);
create index if not exists external_ai_results_status_idx      on public.external_ai_results(status);
create index if not exists external_ai_results_created_at_idx  on public.external_ai_results(created_at desc);

create index if not exists external_ai_findings_result_id_idx  on public.external_ai_findings(external_ai_result_id);
create index if not exists external_ai_findings_study_id_idx   on public.external_ai_findings(study_id);
create index if not exists external_ai_findings_clinic_id_idx  on public.external_ai_findings(clinic_id);
create index if not exists external_ai_findings_accepted_idx   on public.external_ai_findings(accepted);

-- ── Triggers ──────────────────────────────────────────────────────────────────
drop trigger if exists external_ai_results_updated_at  on public.external_ai_results;
create trigger external_ai_results_updated_at
  before update on public.external_ai_results
  for each row execute function public.handle_updated_at();

drop trigger if exists external_ai_findings_updated_at on public.external_ai_findings;
create trigger external_ai_findings_updated_at
  before update on public.external_ai_findings
  for each row execute function public.handle_updated_at();

-- ── RLS — external_ai_results ─────────────────────────────────────────────────
alter table public.external_ai_results enable row level security;

drop policy if exists "external_ai_results_select"              on public.external_ai_results;
drop policy if exists "external_ai_results_insert"              on public.external_ai_results;
drop policy if exists "external_ai_results_update"              on public.external_ai_results;
drop policy if exists "external_ai_results_super_admin_select"  on public.external_ai_results;
drop policy if exists "external_ai_results_super_admin_insert"  on public.external_ai_results;
drop policy if exists "external_ai_results_super_admin_update"  on public.external_ai_results;

-- clinic_admin, radiologist, technician can read within their clinic
create policy "external_ai_results_select" on public.external_ai_results
  for select
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'technician', 'super_admin'))
  );

-- clinic_admin and radiologist can import and manage
create policy "external_ai_results_insert" on public.external_ai_results
  for insert
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "external_ai_results_update" on public.external_ai_results
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "external_ai_results_super_admin_select" on public.external_ai_results
  for select using (is_super_admin());

create policy "external_ai_results_super_admin_insert" on public.external_ai_results
  for insert with check (is_super_admin());

create policy "external_ai_results_super_admin_update" on public.external_ai_results
  for update using (is_super_admin()) with check (is_super_admin());

-- ── RLS — external_ai_findings ────────────────────────────────────────────────
alter table public.external_ai_findings enable row level security;

drop policy if exists "external_ai_findings_select"             on public.external_ai_findings;
drop policy if exists "external_ai_findings_insert"             on public.external_ai_findings;
drop policy if exists "external_ai_findings_update"             on public.external_ai_findings;
drop policy if exists "external_ai_findings_super_admin_select" on public.external_ai_findings;
drop policy if exists "external_ai_findings_super_admin_insert" on public.external_ai_findings;
drop policy if exists "external_ai_findings_super_admin_update" on public.external_ai_findings;

create policy "external_ai_findings_select" on public.external_ai_findings
  for select
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'technician', 'super_admin'))
  );

create policy "external_ai_findings_insert" on public.external_ai_findings
  for insert
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "external_ai_findings_update" on public.external_ai_findings
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "external_ai_findings_super_admin_select" on public.external_ai_findings
  for select using (is_super_admin());

create policy "external_ai_findings_super_admin_insert" on public.external_ai_findings
  for insert with check (is_super_admin());

create policy "external_ai_findings_super_admin_update" on public.external_ai_findings
  for update using (is_super_admin()) with check (is_super_admin());
