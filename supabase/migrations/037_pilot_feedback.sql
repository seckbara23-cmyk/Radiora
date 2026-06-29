-- Phase 6A.5 — Clinical pilot feedback.
--
-- In-app feedback submitted by pilot users (any clinic member). Carries no
-- clinical content — a free-text note plus a category and priority. Tenant
-- isolation is enforced by RLS: a member may insert feedback only into their own
-- clinic as themselves; only clinic admins (and platform super admins) may read
-- their clinic's feedback for the pilot dashboard.

create table if not exists public.pilot_feedback (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid references public.clinics (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  category   text not null check (category in ('workflow', 'ai', 'ui', 'performance', 'other')),
  priority   text not null check (priority in ('critical', 'important', 'nice_to_have')),
  message    text not null,
  status     text not null default 'new' check (status in ('new', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists pilot_feedback_clinic_idx  on public.pilot_feedback (clinic_id);
create index if not exists pilot_feedback_created_idx on public.pilot_feedback (created_at desc);

alter table public.pilot_feedback enable row level security;

-- Any authenticated clinic member can submit feedback as themselves, into their
-- own clinic. user_id is pinned to the caller to prevent attribution spoofing.
drop policy if exists "pilot_feedback: member insert own clinic" on public.pilot_feedback;
create policy "pilot_feedback: member insert own clinic"
  on public.pilot_feedback for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and clinic_id = public.get_current_user_clinic_id()
  );

-- Clinic admins read their clinic's feedback; super admins read all.
drop policy if exists "pilot_feedback: admins read own clinic" on public.pilot_feedback;
create policy "pilot_feedback: admins read own clinic"
  on public.pilot_feedback for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() = 'clinic_admin'
    )
  );

-- Clinic admins may triage (status) their clinic's feedback; super admins any.
drop policy if exists "pilot_feedback: admins update own clinic" on public.pilot_feedback;
create policy "pilot_feedback: admins update own clinic"
  on public.pilot_feedback for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() = 'clinic_admin'
    )
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() = 'clinic_admin'
    )
  );
