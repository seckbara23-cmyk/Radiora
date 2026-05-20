-- ─── SLA Tracking + Critical Flags (Phase 5) ──────────────────────────────────

-- ── A) SLA columns on studies ─────────────────────────────────────────────────
-- turnaround_target_minutes: configurable target per study (default from priority)
-- sla_due_at: absolute deadline (created_at + target)
-- sla_breached_at: set when study is still unreported past due_at
alter table public.studies
  add column if not exists turnaround_target_minutes integer,
  add column if not exists sla_due_at               timestamptz,
  add column if not exists sla_breached_at           timestamptz;

-- Populate defaults for existing rows based on priority
update public.studies
  set turnaround_target_minutes = case
    when priority = 'stat'    then 60
    when priority = 'urgent'  then 240
    else                           1440
  end
  where turnaround_target_minutes is null;

update public.studies
  set sla_due_at = created_at + (turnaround_target_minutes * interval '1 minute')
  where sla_due_at is null and turnaround_target_minutes is not null;

create index if not exists studies_sla_due_at_idx      on public.studies(sla_due_at);
create index if not exists studies_sla_breached_at_idx on public.studies(sla_breached_at);

-- ── B) critical_flags ────────────────────────────────────────────────────────
-- Unified table for manually flagged critical findings on studies or reports.
-- External AI findings with severity='critical' in external_ai_findings are
-- also surfaced in the critical queue without duplication here.
create table if not exists public.critical_flags (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references public.clinics(id) on delete cascade,
  study_id                uuid references public.studies(id) on delete cascade,
  report_id               uuid references public.reports(id) on delete cascade,
  external_ai_finding_id  uuid references public.external_ai_findings(id) on delete cascade,

  severity                text not null check (severity in ('low', 'moderate', 'high', 'critical')),
  flag_type               text not null default 'clinical_finding'
                            check (flag_type in (
                              'clinical_finding',
                              'incidental_finding',
                              'life_threatening',
                              'patient_safety',
                              'other'
                            )),
  description             text not null,

  status                  text not null default 'open'
                            check (status in ('open', 'acknowledged', 'resolved')),

  flagged_by              uuid not null references auth.users(id),
  acknowledged_by         uuid references auth.users(id),
  acknowledged_at         timestamptz,
  resolved_by             uuid references auth.users(id),
  resolved_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists critical_flags_clinic_id_idx  on public.critical_flags(clinic_id);
create index if not exists critical_flags_study_id_idx   on public.critical_flags(study_id);
create index if not exists critical_flags_report_id_idx  on public.critical_flags(report_id);
create index if not exists critical_flags_status_idx     on public.critical_flags(status);
create index if not exists critical_flags_severity_idx   on public.critical_flags(severity);
create index if not exists critical_flags_created_at_idx on public.critical_flags(created_at desc);

drop trigger if exists critical_flags_updated_at on public.critical_flags;
create trigger critical_flags_updated_at
  before update on public.critical_flags
  for each row execute function public.handle_updated_at();

-- ── RLS — critical_flags ──────────────────────────────────────────────────────
alter table public.critical_flags enable row level security;

drop policy if exists "critical_flags_select"           on public.critical_flags;
drop policy if exists "critical_flags_insert"           on public.critical_flags;
drop policy if exists "critical_flags_update"           on public.critical_flags;
drop policy if exists "critical_flags_super_admin_all"  on public.critical_flags;

-- clinic_admin, radiologist, technician can read
create policy "critical_flags_select" on public.critical_flags
  for select using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'technician', 'super_admin'))
  );

-- clinic_admin + radiologist can flag
create policy "critical_flags_insert" on public.critical_flags
  for insert with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "critical_flags_update" on public.critical_flags
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "critical_flags_super_admin_all" on public.critical_flags
  for all using (is_super_admin()) with check (is_super_admin());
