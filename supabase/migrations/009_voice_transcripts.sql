-- ─── Voice Transcripts (Phase 4D) ─────────────────────────────────────────────
-- Stores browser-captured voice dictation transcripts.
-- No audio files — text only. Clinician review mandatory before clinical use.
-- Transcript source tracks origin for future real provider integration.

create table if not exists public.voice_transcripts (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references public.clinics(id) on delete cascade,

  -- All three are nullable; at least report_id or study_id should be set at call time
  report_id              uuid references public.reports(id) on delete set null,
  study_id               uuid references public.studies(id) on delete set null,
  patient_id             uuid references public.patients(id) on delete set null,

  language               text not null default 'en',
  transcript_status      text not null default 'recorded'
                           check (transcript_status in ('recorded', 'transcribed', 'reviewed', 'rejected', 'archived')),

  transcript_text        text not null default '',
  transcript_source      text not null default 'browser_speech_api'
                           check (transcript_source in ('mock_local', 'browser_speech_api', 'future_external_provider')),

  audio_duration_seconds integer,

  created_by             uuid not null references auth.users(id),
  reviewed_by            uuid references auth.users(id),
  reviewed_at            timestamptz,
  rejection_reason       text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists voice_transcripts_clinic_id_idx          on public.voice_transcripts(clinic_id);
create index if not exists voice_transcripts_report_id_idx          on public.voice_transcripts(report_id);
create index if not exists voice_transcripts_study_id_idx           on public.voice_transcripts(study_id);
create index if not exists voice_transcripts_transcript_status_idx  on public.voice_transcripts(transcript_status);
create index if not exists voice_transcripts_created_at_idx         on public.voice_transcripts(created_at desc);

-- ── updated_at trigger ────────────────────────────────────────────────────────
drop trigger if exists voice_transcripts_updated_at on public.voice_transcripts;
create trigger voice_transcripts_updated_at
  before update on public.voice_transcripts
  for each row execute function public.handle_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table public.voice_transcripts enable row level security;

-- ── Policies (drop first for idempotency) ─────────────────────────────────────
drop policy if exists "voice_transcripts_select"               on public.voice_transcripts;
drop policy if exists "voice_transcripts_insert"               on public.voice_transcripts;
drop policy if exists "voice_transcripts_update"               on public.voice_transcripts;
drop policy if exists "voice_transcripts_super_admin_select"   on public.voice_transcripts;
drop policy if exists "voice_transcripts_super_admin_insert"   on public.voice_transcripts;
drop policy if exists "voice_transcripts_super_admin_update"   on public.voice_transcripts;

-- clinic_admin and radiologist within same clinic can read
create policy "voice_transcripts_select" on public.voice_transcripts
  for select
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

-- clinic_admin and radiologist within same clinic can insert
create policy "voice_transcripts_insert" on public.voice_transcripts
  for insert
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

-- clinic_admin and radiologist within same clinic can update (review, reject, archive)
create policy "voice_transcripts_update" on public.voice_transcripts
  for update
  using (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  )
  with check (
    (clinic_id = get_current_user_clinic_id())
    and (get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin'))
  );

-- super_admin bypass policies
create policy "voice_transcripts_super_admin_select" on public.voice_transcripts
  for select
  using (is_super_admin());

create policy "voice_transcripts_super_admin_insert" on public.voice_transcripts
  for insert
  with check (is_super_admin());

create policy "voice_transcripts_super_admin_update" on public.voice_transcripts
  for update
  using (is_super_admin())
  with check (is_super_admin());
