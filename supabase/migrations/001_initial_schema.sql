-- =============================================================================
-- Radiology AI Reporting — Initial Schema
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor, or via `supabase db push`
-- =============================================================================

-- ─── Enum types ──────────────────────────────────────────────────────────────

create type public.user_role as enum (
  'super_admin',           -- cross-clinic platform admin
  'clinic_admin',          -- manages a single clinic
  'radiologist',           -- creates and signs reports
  'technician',            -- uploads and manages studies
  'referring_physician',   -- read-only access to own patients
  'viewer'                 -- read-only observer
);

create type public.clinic_status as enum ('active', 'trial', 'suspended', 'inactive');
create type public.clinic_plan   as enum ('starter', 'professional', 'enterprise');

create type public.patient_status as enum ('active', 'inactive', 'deceased');
create type public.patient_sex    as enum ('male', 'female', 'other', 'unknown');

create type public.study_modality as enum (
  'CT', 'MRI', 'XR', 'US', 'NM', 'PT', 'MG', 'DX', 'CR'
);
create type public.study_priority as enum ('routine', 'urgent', 'stat');
create type public.study_status   as enum ('pending', 'in_progress', 'completed', 'cancelled');

create type public.report_status as enum ('draft', 'in_review', 'finalized', 'amended');

-- ─── Trigger: auto-update updated_at ─────────────────────────────────────────

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Table: clinics ───────────────────────────────────────────────────────────
-- The multi-tenant anchor. Every tenant-owned row carries a clinic_id FK.

create table public.clinics (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,   -- URL-safe tenant identifier
  address    text,
  city       text,
  state      text,
  country    text        not null default 'US',
  phone      text,
  email      text,
  status     public.clinic_status not null default 'trial',
  plan       public.clinic_plan   not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinics_updated_at
  before update on public.clinics
  for each row execute function public.handle_updated_at();

-- ─── Table: profiles ─────────────────────────────────────────────────────────
-- Extends auth.users with application-level fields.
-- clinic_id is nullable to support super_admin accounts that span all clinics.

create table public.profiles (
  id             uuid            primary key references auth.users (id) on delete cascade,
  clinic_id      uuid            references public.clinics (id) on delete set null,
  role           public.user_role not null default 'viewer',
  first_name     text            not null default '',
  last_name      text            not null default '',
  specialty      text,
  license_number text,
  is_active      boolean         not null default true,
  created_at     timestamptz     not null default now(),
  updated_at     timestamptz     not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create a stub profile when auth.users gets a new row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Helper functions ─────────────────────────────────────────────────────────
-- security definer + explicit search_path prevents search_path injection.
-- stable = result may change between transactions but not within one.

create or replace function public.get_current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.get_current_user_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ─── Table: patients ──────────────────────────────────────────────────────────

create table public.patients (
  id            uuid                 primary key default gen_random_uuid(),
  clinic_id     uuid                 not null references public.clinics (id) on delete cascade,
  mrn           text                 not null,
  first_name    text                 not null,
  last_name     text                 not null,
  date_of_birth date                 not null,
  sex           public.patient_sex   not null default 'unknown',
  email         text,
  phone         text,
  status        public.patient_status not null default 'active',
  created_at    timestamptz          not null default now(),
  updated_at    timestamptz          not null default now(),

  -- MRN is unique within a clinic, not globally
  unique (clinic_id, mrn)
);

create index patients_clinic_id_idx on public.patients (clinic_id);
create index patients_status_idx    on public.patients (status);

create trigger patients_updated_at
  before update on public.patients
  for each row execute function public.handle_updated_at();

-- ─── Table: studies ───────────────────────────────────────────────────────────

create table public.studies (
  id                  uuid                  primary key default gen_random_uuid(),
  clinic_id           uuid                  not null references public.clinics (id)  on delete cascade,
  patient_id          uuid                  not null references public.patients (id) on delete cascade,
  accession_number    text                  not null,
  modality            public.study_modality not null,
  body_part           text                  not null,
  description         text                  not null default '',
  study_date          date                  not null,
  referring_physician text                  not null default '',
  priority            public.study_priority not null default 'routine',
  status              public.study_status   not null default 'pending',
  has_report          boolean               not null default false,
  created_at          timestamptz           not null default now(),
  updated_at          timestamptz           not null default now(),

  -- Accession number is unique within a clinic
  unique (clinic_id, accession_number)
);

create index studies_clinic_id_idx  on public.studies (clinic_id);
create index studies_patient_id_idx on public.studies (patient_id);
create index studies_study_date_idx on public.studies (study_date desc);
create index studies_status_idx     on public.studies (status);

create trigger studies_updated_at
  before update on public.studies
  for each row execute function public.handle_updated_at();

-- ─── Table: reports ───────────────────────────────────────────────────────────

create table public.reports (
  id              uuid                 primary key default gen_random_uuid(),
  clinic_id       uuid                 not null references public.clinics (id)   on delete cascade,
  study_id        uuid                 not null references public.studies (id)   on delete cascade,
  patient_id      uuid                 not null references public.patients (id)  on delete cascade,
  author_id       uuid                 not null references public.profiles (id)  on delete restrict,
  status          public.report_status not null default 'draft',
  findings        text                 not null default '',
  impression      text                 not null default '',
  recommendations text,
  ai_draft        text,                -- populated by future AI layer
  signed_at       timestamptz,         -- set automatically on finalization
  created_at      timestamptz          not null default now(),
  updated_at      timestamptz          not null default now()
);

create index reports_clinic_id_idx   on public.reports (clinic_id);
create index reports_study_id_idx    on public.reports (study_id);
create index reports_patient_id_idx  on public.reports (patient_id);
create index reports_author_id_idx   on public.reports (author_id);
create index reports_status_idx      on public.reports (status);

create trigger reports_updated_at
  before update on public.reports
  for each row execute function public.handle_updated_at();

-- Auto-set signed_at when a report is finalized; clear it on un-finalization.
create or replace function public.handle_report_finalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'finalized' and old.status <> 'finalized' then
    new.signed_at := coalesce(new.signed_at, now());
  elsif new.status <> 'finalized' then
    new.signed_at := null;
  end if;
  return new;
end;
$$;

create trigger reports_finalized
  before update on public.reports
  for each row execute function public.handle_report_finalized();

-- Keep studies.has_report in sync automatically.
create or replace function public.sync_study_has_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- On UPDATE where study_id changed, recalculate both the old and new study.
  -- This handles the rare case of reassigning a report to a different study.
  if tg_op = 'UPDATE' and old.study_id is distinct from new.study_id then
    update public.studies
       set has_report = exists (
             select 1 from public.reports where study_id = old.study_id
           )
     where id = old.study_id;
  end if;

  -- For INSERT, UPDATE (same study_id), and DELETE, recalculate the relevant study.
  update public.studies
     set has_report = exists (
           select 1 from public.reports
            where study_id = coalesce(new.study_id, old.study_id)
         )
   where id = coalesce(new.study_id, old.study_id);

  return null;  -- AFTER trigger; return value is ignored
end;
$$;

create trigger reports_sync_has_report
  after insert or update or delete on public.reports
  for each row execute function public.sync_study_has_report();

-- ─── Table: audit_logs ────────────────────────────────────────────────────────
-- Immutable append-only log. No updated_at. user_id is nullable so logs survive
-- user deletion (on delete set null preserves the audit trail).

create table public.audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  clinic_id   uuid        references public.clinics (id)   on delete set null,
  user_id     uuid        references auth.users (id) on delete set null,
  action      text        not null,   -- e.g. 'report.finalized', 'study.uploaded'
  entity_type text        not null,   -- 'report' | 'study' | 'patient' | ...
  entity_id   uuid,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index audit_logs_clinic_id_idx  on public.audit_logs (clinic_id);
create index audit_logs_user_id_idx    on public.audit_logs (user_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.clinics    enable row level security;
alter table public.profiles   enable row level security;
alter table public.patients   enable row level security;
alter table public.studies    enable row level security;
alter table public.reports    enable row level security;
alter table public.audit_logs enable row level security;

-- ── clinics ──────────────────────────────────────────────────────────────────

-- Super admins can do anything to any clinic
create policy "clinics: super_admin all"
  on public.clinics for all
  to authenticated
  using      (public.is_super_admin())
  with check (public.is_super_admin());

-- Clinic members can read their own clinic row
create policy "clinics: members read own"
  on public.clinics for select
  to authenticated
  using (id = public.get_current_user_clinic_id());

-- ── profiles ─────────────────────────────────────────────────────────────────

-- Super admins can manage all profiles
create policy "profiles: super_admin all"
  on public.profiles for all
  to authenticated
  using      (public.is_super_admin())
  with check (public.is_super_admin());

-- Every user can read their own profile
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Every user can update their own profile
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using      (id = auth.uid())
  with check (id = auth.uid());

-- Clinic admins can read all profiles within their clinic
create policy "profiles: clinic_admin read clinic"
  on public.profiles for select
  to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

-- ── patients ─────────────────────────────────────────────────────────────────

create policy "patients: read own clinic"
  on public.patients for select
  to authenticated
  using (
    public.is_super_admin()
    or clinic_id = public.get_current_user_clinic_id()
  );

create policy "patients: write own clinic (staff only)"
  on public.patients for insert
  to authenticated
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'technician')
    )
  );

create policy "patients: update own clinic (staff only)"
  on public.patients for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'technician')
    )
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'technician')
    )
  );

-- ── studies ──────────────────────────────────────────────────────────────────

create policy "studies: read own clinic"
  on public.studies for select
  to authenticated
  using (
    public.is_super_admin()
    or clinic_id = public.get_current_user_clinic_id()
  );

create policy "studies: insert own clinic (staff only)"
  on public.studies for insert
  to authenticated
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'technician')
    )
  );

create policy "studies: update own clinic (staff only)"
  on public.studies for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'technician')
    )
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'technician')
    )
  );

-- ── reports ──────────────────────────────────────────────────────────────────

create policy "reports: read own clinic"
  on public.reports for select
  to authenticated
  using (
    public.is_super_admin()
    or clinic_id = public.get_current_user_clinic_id()
  );

create policy "reports: insert (radiologists and admins)"
  on public.reports for insert
  to authenticated
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist')
    )
  );

create policy "reports: update (radiologists and admins)"
  on public.reports for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist')
    )
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist')
    )
  );

-- ── audit_logs ───────────────────────────────────────────────────────────────

-- Any authenticated user can append their own log entries
create policy "audit_logs: users insert own"
  on public.audit_logs for insert
  to authenticated
  with check (user_id = auth.uid());

-- Clinic admins can read their clinic's audit trail
create policy "audit_logs: admins read own clinic"
  on public.audit_logs for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() = 'clinic_admin'
    )
  );
