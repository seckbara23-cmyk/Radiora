-- =============================================================================
-- Migration 044: R2.2 — report-linked dictation ownership
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 043)
--
-- WHY:
--   The dictation subsystem (018/019) is hard-wired to the vacation queue:
--     dictation_sessions.vacation_item_id  NOT NULL
--     transcriptions.vacation_item_id      NOT NULL
--   A report created directly from a study therefore cannot own a transcript, so
--   (a) QR dictation cannot start from a report, and (b) the signing gate's AI
--   review metadata cannot survive save/reload on that path — getReportSafetyContext
--   resolves report → vacation_items → transcriptions and finds nothing.
--
-- WHAT: the SAME subsystem gains a second owner kind. No second audio or
--   transcription subsystem is introduced, and the vacation-item workflow is
--   untouched.
--
--     dictation_sessions : vacation_item_id XOR report_id   (exactly one)
--     transcriptions     : vacation_item_id XOR report_id   (exactly one)
--     audio_assets       : vacation_id      NAND report_id  (never both)
--
--   ── Why audio_assets is NAND, not XOR ──────────────────────────────────────
--   audio_assets has no vacation_item_id at all; its queue link is the nullable
--   `vacation_id` plus the reverse pointer vacation_items.audio_asset_id. More
--   importantly the table deliberately models UNASSIGNED audio: ingestion_mode
--   'batch' | 'long' and status 'uploaded' exist precisely so a recording can be
--   ingested before it is matched to anything, and uploadAudio() inserts with
--   vacation_id = NULL in that case. Requiring an owner would break batch
--   ingestion and reject existing rows. Both owners at once is still forbidden,
--   which is the property that actually matters for isolation.
--
-- CLINIC ISOLATION: RLS on these tables keys off the row's own clinic_id, so it
--   cannot by itself stop a user from attaching dictation to ANOTHER clinic's
--   report while setting clinic_id to their own. A trigger closes that.
--
-- Forward-only. Additive columns, relaxed NOT NULLs, new constraints. No row is
-- rewritten and no historical ownership is reassigned.
-- =============================================================================

-- ─── 0. Pre-flight (counts only; fails loudly on ambiguity) ───────────────────

do $$
declare
  v_sessions_no_item bigint;
  v_trans_no_item    bigint;
  v_dup_report_items bigint;
begin
  select count(*) into v_sessions_no_item
    from public.dictation_sessions where vacation_item_id is null;
  select count(*) into v_trans_no_item
    from public.transcriptions where vacation_item_id is null;

  -- vacation_items.report_id must already be single-valued per report before we
  -- can promise that uniqueness. getReportSafetyContext already assumes it.
  select count(*) into v_dup_report_items from (
    select report_id from public.vacation_items
     where report_id is not null
     group by report_id having count(*) > 1
  ) d;

  raise notice 'R2.2 pre-flight: dictation_sessions without a vacation item: %', v_sessions_no_item;
  raise notice 'R2.2 pre-flight: transcriptions without a vacation item: %', v_trans_no_item;
  raise notice 'R2.2 pre-flight: reports linked to more than one queue item: %', v_dup_report_items;

  -- Both columns are NOT NULL today, so these must be zero. A non-zero value
  -- means the schema is not what this migration was written against — stop.
  if v_sessions_no_item > 0 or v_trans_no_item > 0 then
    raise exception 'MIGRATION 044 ABORTED: pre-existing rows without a vacation item (sessions=%, transcriptions=%). Investigate before adding ownership constraints.',
      v_sessions_no_item, v_trans_no_item;
  end if;

  if v_dup_report_items > 0 then
    raise exception 'MIGRATION 044 ABORTED: % report(s) are linked to more than one vacation item; resolve before adding UNIQUE(report_id).',
      v_dup_report_items;
  end if;
end;
$$;

-- ─── 1. dictation_sessions ────────────────────────────────────────────────────
-- ON DELETE CASCADE mirrors the existing vacation_item_id behaviour: a pairing
-- session is a short-lived capability for one owner and is meaningless without it.

alter table public.dictation_sessions
  add column if not exists report_id uuid references public.reports(id) on delete cascade;

alter table public.dictation_sessions
  alter column vacation_item_id drop not null;

alter table public.dictation_sessions
  drop constraint if exists dictation_sessions_one_owner;
alter table public.dictation_sessions
  add constraint dictation_sessions_one_owner
  check (num_nonnulls(vacation_item_id, report_id) = 1);

create index if not exists dictation_sessions_report_idx
  on public.dictation_sessions (report_id) where report_id is not null;

comment on column public.dictation_sessions.report_id is
  'Report-owned dictation session. Exactly one of vacation_item_id / report_id is set (dictation_sessions_one_owner) — R2.2.';

-- ─── 2. audio_assets ──────────────────────────────────────────────────────────
-- ON DELETE SET NULL mirrors vacation_id: deleting the clinical owner must not
-- silently destroy the stored audio row, which still accounts for a private
-- storage object that needs deliberate cleanup.

alter table public.audio_assets
  add column if not exists report_id uuid references public.reports(id) on delete set null;

alter table public.audio_assets
  drop constraint if exists audio_assets_single_owner;
alter table public.audio_assets
  add constraint audio_assets_single_owner
  check (num_nonnulls(vacation_id, report_id) <= 1);

create index if not exists audio_assets_report_idx
  on public.audio_assets (report_id) where report_id is not null;

comment on column public.audio_assets.report_id is
  'Report-owned audio. Never set together with vacation_id (audio_assets_single_owner). Both may be NULL: batch/long ingestion stores audio before it is assigned — R2.2.';

-- ─── 3. transcriptions ────────────────────────────────────────────────────────
-- ON DELETE CASCADE mirrors the existing vacation_item_id behaviour: a transcript
-- is content belonging to one clinical owner, not an independent record. The
-- signed report's own provenance lives in report_versions, which is unaffected.
--
-- No UNIQUE(report_id): a report may legitimately be dictated in several passes.
-- The signing-safety lookup takes the most recent transcription for the report.

alter table public.transcriptions
  add column if not exists report_id uuid references public.reports(id) on delete cascade;

alter table public.transcriptions
  alter column vacation_item_id drop not null;

alter table public.transcriptions
  drop constraint if exists transcriptions_one_owner;
alter table public.transcriptions
  add constraint transcriptions_one_owner
  check (num_nonnulls(vacation_item_id, report_id) = 1);

create index if not exists transcriptions_report_idx
  on public.transcriptions (report_id, created_at desc) where report_id is not null;

comment on column public.transcriptions.report_id is
  'Report-owned transcript. Exactly one of vacation_item_id / report_id is set (transcriptions_one_owner). Several passes per report are allowed; the signing gate reads the most recent — R2.2.';

-- The existing UNIQUE (vacation_item_id) still holds for queue-owned rows;
-- Postgres allows many NULLs, so report-owned rows do not collide.

-- ─── 4. vacation_items — unambiguous queue linkage ────────────────────────────
-- getReportSafetyContext already does .maybeSingle() on this lookup; make that
-- assumption real. Historical rows are not rewritten (pre-flight proved there
-- are no duplicates).

create unique index if not exists vacation_items_report_uidx
  on public.vacation_items (report_id) where report_id is not null;

-- ─── 5. Clinic isolation for the new owner ────────────────────────────────────
-- RLS keys off the ROW's clinic_id, so it cannot stop a caller from pointing a
-- correctly-scoped row at another clinic's report. This validates the owner.

create or replace function public.enforce_dictation_owner_clinic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_clinic uuid;
begin
  if new.report_id is not null then
    select r.clinic_id into v_owner_clinic
      from public.reports r where r.id = new.report_id;

    if v_owner_clinic is null then
      raise exception 'Dictation owner report % does not exist', new.report_id
        using errcode = '23503';
    end if;
    if v_owner_clinic is distinct from new.clinic_id then
      raise exception 'Dictation cannot be attached to a report from another clinic'
        using errcode = '42501';
    end if;
  end if;

  -- Same guarantee for the existing queue owner, which was never enforced.
  if to_jsonb(new) ? 'vacation_item_id' and new.vacation_item_id is not null then
    select vi.clinic_id into v_owner_clinic
      from public.vacation_items vi where vi.id = new.vacation_item_id;

    if v_owner_clinic is null then
      raise exception 'Dictation owner queue item % does not exist', new.vacation_item_id
        using errcode = '23503';
    end if;
    if v_owner_clinic is distinct from new.clinic_id then
      raise exception 'Dictation cannot be attached to a queue item from another clinic'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_dictation_owner_clinic() is
  'R2.2 — the dictation row and its clinical owner must belong to the same clinic. RLS alone cannot express this because it only sees the row''s own clinic_id.';

drop trigger if exists dictation_sessions_owner_clinic on public.dictation_sessions;
create trigger dictation_sessions_owner_clinic
  before insert or update on public.dictation_sessions
  for each row execute function public.enforce_dictation_owner_clinic();

drop trigger if exists transcriptions_owner_clinic on public.transcriptions;
create trigger transcriptions_owner_clinic
  before insert or update on public.transcriptions
  for each row execute function public.enforce_dictation_owner_clinic();

drop trigger if exists audio_assets_owner_clinic on public.audio_assets;
create trigger audio_assets_owner_clinic
  before insert or update on public.audio_assets
  for each row execute function public.enforce_dictation_owner_clinic();

-- RLS is deliberately UNCHANGED. Every policy on these three tables already
-- scopes by the row's clinic_id, which report-owned rows carry exactly as
-- queue-owned rows do, and the trigger above closes the cross-clinic gap that
-- clinic_id alone leaves open. No policy is widened and none is dropped.

-- ─── 6. Self-verification ─────────────────────────────────────────────────────

do $$
declare
  v_bad bigint;
begin
  -- columns
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='dictation_sessions' and column_name='report_id') then
    raise exception 'SELF-CHECK FAILED: dictation_sessions.report_id missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='transcriptions' and column_name='report_id') then
    raise exception 'SELF-CHECK FAILED: transcriptions.report_id missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='audio_assets' and column_name='report_id') then
    raise exception 'SELF-CHECK FAILED: audio_assets.report_id missing';
  end if;

  -- nullability relaxed
  if (select is_nullable from information_schema.columns
      where table_schema='public' and table_name='dictation_sessions' and column_name='vacation_item_id') <> 'YES' then
    raise exception 'SELF-CHECK FAILED: dictation_sessions.vacation_item_id is still NOT NULL';
  end if;
  if (select is_nullable from information_schema.columns
      where table_schema='public' and table_name='transcriptions' and column_name='vacation_item_id') <> 'YES' then
    raise exception 'SELF-CHECK FAILED: transcriptions.vacation_item_id is still NOT NULL';
  end if;

  -- constraints
  if not exists (select 1 from pg_constraint where conname='dictation_sessions_one_owner') then
    raise exception 'SELF-CHECK FAILED: dictation_sessions_one_owner missing';
  end if;
  if not exists (select 1 from pg_constraint where conname='transcriptions_one_owner') then
    raise exception 'SELF-CHECK FAILED: transcriptions_one_owner missing';
  end if;
  if not exists (select 1 from pg_constraint where conname='audio_assets_single_owner') then
    raise exception 'SELF-CHECK FAILED: audio_assets_single_owner missing';
  end if;

  -- indexes
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='transcriptions_report_idx') then
    raise exception 'SELF-CHECK FAILED: transcriptions_report_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='dictation_sessions_report_idx') then
    raise exception 'SELF-CHECK FAILED: dictation_sessions_report_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='vacation_items_report_uidx') then
    raise exception 'SELF-CHECK FAILED: vacation_items_report_uidx missing';
  end if;

  -- triggers
  if not exists (select 1 from pg_trigger where tgname='transcriptions_owner_clinic'
                   and tgrelid='public.transcriptions'::regclass) then
    raise exception 'SELF-CHECK FAILED: transcriptions_owner_clinic trigger missing';
  end if;

  -- no row violates the new rules
  select count(*) into v_bad from public.dictation_sessions
   where num_nonnulls(vacation_item_id, report_id) <> 1;
  if v_bad > 0 then raise exception 'SELF-CHECK FAILED: % dictation_sessions row(s) without exactly one owner', v_bad; end if;

  select count(*) into v_bad from public.transcriptions
   where num_nonnulls(vacation_item_id, report_id) <> 1;
  if v_bad > 0 then raise exception 'SELF-CHECK FAILED: % transcription row(s) without exactly one owner', v_bad; end if;

  select count(*) into v_bad from public.audio_assets
   where num_nonnulls(vacation_id, report_id) > 1;
  if v_bad > 0 then raise exception 'SELF-CHECK FAILED: % audio_asset row(s) with both owners', v_bad; end if;

  raise notice 'R2.2: report-linked dictation ownership installed; all rows satisfy the constraints.';
end;
$$;
