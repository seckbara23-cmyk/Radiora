-- ─── Peer Review / QA Foundation (Phase 5) ────────────────────────────────────
-- Schema foundation for peer review, QA flagging, and discrepancy tracking.
-- Full workflow implementation is deferred — schema only for now.

-- ── A) peer_reviews ───────────────────────────────────────────────────────────
-- Assigns a report to a radiologist for peer review.
create table if not exists public.peer_reviews (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics(id) on delete cascade,
  report_id         uuid not null references public.reports(id) on delete cascade,

  assigned_to       uuid not null references auth.users(id),
  assigned_by       uuid not null references auth.users(id),
  assigned_at       timestamptz not null default now(),

  status            text not null default 'pending'
                      check (status in ('pending', 'in_review', 'completed', 'cancelled')),

  score             integer check (score >= 1 and score <= 5),
  overall_quality   text check (overall_quality in ('excellent', 'acceptable', 'needs_improvement', 'unsatisfactory')),
  reviewer_notes    text,

  completed_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── B) qa_flags ───────────────────────────────────────────────────────────────
-- Quality flags raised against a report by any reviewer.
create table if not exists public.qa_flags (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics(id) on delete cascade,
  report_id         uuid not null references public.reports(id) on delete cascade,
  peer_review_id    uuid references public.peer_reviews(id) on delete set null,

  flag_category     text not null check (flag_category in (
                      'clinical_accuracy',
                      'report_completeness',
                      'communication_clarity',
                      'guideline_adherence',
                      'critical_miss',
                      'other'
                    )),
  severity          text not null default 'minor'
                      check (severity in ('minor', 'moderate', 'major', 'critical')),
  description       text not null,

  flagged_by        uuid not null references auth.users(id),
  resolved_by       uuid references auth.users(id),
  resolved_at       timestamptz,
  resolution_notes  text,

  status            text not null default 'open'
                      check (status in ('open', 'acknowledged', 'resolved', 'disputed')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── C) discrepancy_reviews ────────────────────────────────────────────────────
-- Tracks clinical discrepancies found during peer review or QA.
create table if not exists public.discrepancy_reviews (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references public.clinics(id) on delete cascade,
  report_id             uuid not null references public.reports(id) on delete cascade,
  peer_review_id        uuid references public.peer_reviews(id) on delete set null,

  discrepancy_type      text not null check (discrepancy_type in (
                          'minor',
                          'moderate',
                          'major',
                          'critical'
                        )),
  category              text not null check (category in (
                          'false_negative',
                          'false_positive',
                          'interpretation_error',
                          'measurement_error',
                          'missed_finding',
                          'overcall',
                          'undercall',
                          'other'
                        )),
  original_finding      text not null,
  corrected_finding     text not null,
  clinical_impact       text check (clinical_impact in ('none', 'minor', 'significant', 'major')),
  description           text,

  identified_by         uuid not null references auth.users(id),
  reviewed_by           uuid references auth.users(id),
  reviewed_at           timestamptz,

  status                text not null default 'open'
                          check (status in ('open', 'reviewed', 'closed')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists peer_reviews_clinic_id_idx        on public.peer_reviews(clinic_id);
create index if not exists peer_reviews_report_id_idx        on public.peer_reviews(report_id);
create index if not exists peer_reviews_assigned_to_idx      on public.peer_reviews(assigned_to);
create index if not exists peer_reviews_status_idx           on public.peer_reviews(status);

create index if not exists qa_flags_clinic_id_idx            on public.qa_flags(clinic_id);
create index if not exists qa_flags_report_id_idx            on public.qa_flags(report_id);
create index if not exists qa_flags_status_idx               on public.qa_flags(status);
create index if not exists qa_flags_severity_idx             on public.qa_flags(severity);

create index if not exists discrepancy_reviews_clinic_id_idx on public.discrepancy_reviews(clinic_id);
create index if not exists discrepancy_reviews_report_id_idx on public.discrepancy_reviews(report_id);
create index if not exists discrepancy_reviews_status_idx    on public.discrepancy_reviews(status);
create index if not exists discrepancy_reviews_type_idx      on public.discrepancy_reviews(discrepancy_type);

-- ── Triggers ──────────────────────────────────────────────────────────────────
drop trigger if exists peer_reviews_updated_at         on public.peer_reviews;
create trigger peer_reviews_updated_at
  before update on public.peer_reviews
  for each row execute function public.handle_updated_at();

drop trigger if exists qa_flags_updated_at             on public.qa_flags;
create trigger qa_flags_updated_at
  before update on public.qa_flags
  for each row execute function public.handle_updated_at();

drop trigger if exists discrepancy_reviews_updated_at  on public.discrepancy_reviews;
create trigger discrepancy_reviews_updated_at
  before update on public.discrepancy_reviews
  for each row execute function public.handle_updated_at();

-- ── RLS — peer_reviews ────────────────────────────────────────────────────────
alter table public.peer_reviews enable row level security;

drop policy if exists "peer_reviews_select"             on public.peer_reviews;
drop policy if exists "peer_reviews_insert"             on public.peer_reviews;
drop policy if exists "peer_reviews_update"             on public.peer_reviews;
drop policy if exists "peer_reviews_super_admin_all"    on public.peer_reviews;

create policy "peer_reviews_select" on public.peer_reviews
  for select using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "peer_reviews_insert" on public.peer_reviews
  for insert with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "peer_reviews_update" on public.peer_reviews
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "peer_reviews_super_admin_all" on public.peer_reviews
  for all using (is_super_admin()) with check (is_super_admin());

-- ── RLS — qa_flags ────────────────────────────────────────────────────────────
alter table public.qa_flags enable row level security;

drop policy if exists "qa_flags_select"           on public.qa_flags;
drop policy if exists "qa_flags_insert"           on public.qa_flags;
drop policy if exists "qa_flags_update"           on public.qa_flags;
drop policy if exists "qa_flags_super_admin_all"  on public.qa_flags;

create policy "qa_flags_select" on public.qa_flags
  for select using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "qa_flags_insert" on public.qa_flags
  for insert with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "qa_flags_update" on public.qa_flags
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "qa_flags_super_admin_all" on public.qa_flags
  for all using (is_super_admin()) with check (is_super_admin());

-- ── RLS — discrepancy_reviews ─────────────────────────────────────────────────
alter table public.discrepancy_reviews enable row level security;

drop policy if exists "discrepancy_reviews_select"          on public.discrepancy_reviews;
drop policy if exists "discrepancy_reviews_insert"          on public.discrepancy_reviews;
drop policy if exists "discrepancy_reviews_update"          on public.discrepancy_reviews;
drop policy if exists "discrepancy_reviews_super_admin_all" on public.discrepancy_reviews;

create policy "discrepancy_reviews_select" on public.discrepancy_reviews
  for select using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "discrepancy_reviews_insert" on public.discrepancy_reviews
  for insert with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "discrepancy_reviews_update" on public.discrepancy_reviews
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

create policy "discrepancy_reviews_super_admin_all" on public.discrepancy_reviews
  for all using (is_super_admin()) with check (is_super_admin());
