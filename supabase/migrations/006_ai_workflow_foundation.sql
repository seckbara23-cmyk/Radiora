-- =============================================================================
-- Radiora Medical — Phase 4A AI Workflow Foundation
-- =============================================================================
-- Prerequisite: 005_phase3_safety_fixes.sql must already be applied.
-- All statements are idempotent and safe to re-run.
-- No real AI provider calls are made at this stage — provider = 'mock'.
-- =============================================================================

-- ── ai_jobs ──────────────────────────────────────────────────────────────────
-- Tracks each AI structuring request lifecycle.

create table if not exists public.ai_jobs (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        references public.clinics(id) on delete cascade,
  report_id       uuid        not null references public.reports(id) on delete cascade,
  provider        text        not null,  -- 'mock' | 'openai' | 'anthropic' (future)
  model           text,                  -- model identifier when known
  input_text      text        not null,
  status          text        not null default 'pending'
                              check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message   text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── ai_outputs ───────────────────────────────────────────────────────────────
-- Stores the structured output produced by the AI engine for a given job.

create table if not exists public.ai_outputs (
  id                   uuid        primary key default gen_random_uuid(),
  job_id               uuid        not null references public.ai_jobs(id) on delete cascade,
  clinic_id            uuid        references public.clinics(id) on delete cascade,
  report_id            uuid        not null references public.reports(id) on delete cascade,
  clinical_indication  text        not null default '',
  technique            text        not null default '',
  findings             text        not null default '',
  impression           text        not null default '',
  recommendations      text        not null default '',
  raw_response         jsonb,      -- reserved for real provider response envelopes
  created_at           timestamptz not null default now()
);

-- ── ai_reviews ────────────────────────────────────────────────────────────────
-- Records the clinician's accept/reject decision on each AI output.

create table if not exists public.ai_reviews (
  id           uuid        primary key default gen_random_uuid(),
  job_id       uuid        not null references public.ai_jobs(id) on delete cascade,
  clinic_id    uuid        references public.clinics(id) on delete cascade,
  report_id    uuid        not null references public.reports(id) on delete cascade,
  decision     text        not null check (decision in ('accepted', 'rejected')),
  reviewer_id  uuid        references auth.users(id) on delete set null,
  review_note  text,
  created_at   timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists ai_jobs_report_id_idx    on public.ai_jobs    (report_id);
create index if not exists ai_jobs_clinic_id_idx    on public.ai_jobs    (clinic_id);
create index if not exists ai_outputs_job_id_idx    on public.ai_outputs (job_id);
create index if not exists ai_outputs_report_id_idx on public.ai_outputs (report_id);
create index if not exists ai_reviews_job_id_idx    on public.ai_reviews (job_id);
create index if not exists ai_reviews_report_id_idx on public.ai_reviews (report_id);

-- ── updated_at trigger for ai_jobs ───────────────────────────────────────────

drop trigger if exists ai_jobs_updated_at on public.ai_jobs;

create trigger ai_jobs_updated_at
  before update on public.ai_jobs
  for each row execute function public.handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.ai_jobs    enable row level security;
alter table public.ai_outputs enable row level security;
alter table public.ai_reviews enable row level security;

-- ai_jobs: select
drop policy if exists "ai_jobs: select" on public.ai_jobs;
create policy "ai_jobs: select"
  on public.ai_jobs for select to authenticated
  using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ai_jobs: insert
drop policy if exists "ai_jobs: insert" on public.ai_jobs;
create policy "ai_jobs: insert"
  on public.ai_jobs for insert to authenticated
  with check (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ai_outputs: select
drop policy if exists "ai_outputs: select" on public.ai_outputs;
create policy "ai_outputs: select"
  on public.ai_outputs for select to authenticated
  using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ai_outputs: insert
drop policy if exists "ai_outputs: insert" on public.ai_outputs;
create policy "ai_outputs: insert"
  on public.ai_outputs for insert to authenticated
  with check (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ai_reviews: select
drop policy if exists "ai_reviews: select" on public.ai_reviews;
create policy "ai_reviews: select"
  on public.ai_reviews for select to authenticated
  using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ai_reviews: insert
drop policy if exists "ai_reviews: insert" on public.ai_reviews;
create policy "ai_reviews: insert"
  on public.ai_reviews for insert to authenticated
  with check (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );
