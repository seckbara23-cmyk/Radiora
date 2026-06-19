-- F15 — Vocabulary Memory.
--
-- Radiora learns each radiologist's preferred wording from the corrections they
-- make to their own transcripts, and can also hold a clinic-wide shared
-- dictionary. Each entry is a (source_text → target_text) wording pair; nothing
-- here ever modifies clinical meaning (that is enforced in pure code,
-- src/lib/ai/vocabulary.ts, before anything is written) and nothing is
-- auto-applied — the editor only ever SUGGESTS the preferred term.
--
-- Scope model (mirrors hospital_headers' null-clinic idea, one level deeper):
--   * user_id NOT NULL  → personal dictionary, private to that radiologist.
--   * user_id NULL      → clinic-wide shared dictionary (managed by admins).
-- clinic_id is always set; a row never leaves its clinic.

create table if not exists public.vocabulary_entries (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id)  on delete cascade,
  user_id      uuid references public.profiles(id)          on delete cascade,  -- null = clinic-wide
  kind         text not null default 'word'
                 check (kind in ('word', 'phrase', 'spelling', 'terminology', 'conclusion')),
  modality     text,                                  -- null = applies to all modalities
  source_text  text not null,                         -- spoken / mis-transcribed form
  target_text  text not null,                         -- radiologist's preferred form
  frequency    integer not null default 1,            -- how often this correction was confirmed
  confidence   numeric(4,3) not null default 0.200,   -- derived from frequency, capped at 1
  last_used_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vocabulary_entries_scope_idx
  on public.vocabulary_entries (clinic_id, user_id);

create index if not exists vocabulary_entries_modality_idx
  on public.vocabulary_entries (clinic_id, modality) where modality is not null;

-- One canonical row per (scope, kind, modality, normalized source). The COALESCE
-- placeholders let a NULL user_id (clinic-wide) and NULL modality participate in
-- uniqueness; the same expressions are used as the ON CONFLICT target by the
-- learn RPC below, so they must match exactly.
create unique index if not exists vocabulary_entries_dedupe_uq
  on public.vocabulary_entries (
    clinic_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    coalesce(modality, ''),
    lower(source_text)
  );

drop trigger if exists vocabulary_entries_updated_at on public.vocabulary_entries;
create trigger vocabulary_entries_updated_at
  before update on public.vocabulary_entries
  for each row execute function public.handle_updated_at();

alter table public.vocabulary_entries enable row level security;

-- Read: your own personal entries + your clinic's shared entries; super_admin all.
drop policy if exists vocabulary_entries_select on public.vocabulary_entries;
create policy vocabulary_entries_select on public.vocabulary_entries
  for select using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and (user_id is null or user_id = auth.uid())
    )
    or public.is_super_admin()
  );

-- Insert: a personal entry you own, OR a clinic-wide entry if you are an admin.
-- Always within your own clinic.
drop policy if exists vocabulary_entries_insert on public.vocabulary_entries;
create policy vocabulary_entries_insert on public.vocabulary_entries
  for insert with check (
    clinic_id = public.get_current_user_clinic_id()
    and (
      user_id = auth.uid()
      or (
        user_id is null
        and public.get_current_user_role() in ('clinic_admin', 'super_admin')
      )
    )
  );

drop policy if exists vocabulary_entries_update on public.vocabulary_entries;
create policy vocabulary_entries_update on public.vocabulary_entries
  for update using (
    clinic_id = public.get_current_user_clinic_id()
    and (
      user_id = auth.uid()
      or (
        user_id is null
        and public.get_current_user_role() in ('clinic_admin', 'super_admin')
      )
    )
  );

drop policy if exists vocabulary_entries_delete on public.vocabulary_entries;
create policy vocabulary_entries_delete on public.vocabulary_entries
  for delete using (
    clinic_id = public.get_current_user_clinic_id()
    and (
      user_id = auth.uid()
      or (
        user_id is null
        and public.get_current_user_role() in ('clinic_admin', 'super_admin')
      )
    )
  );


-- ─── learn_vocabulary_entry RPC ───────────────────────────────────────────────
-- Upserts a PERSONAL vocabulary entry for the authenticated radiologist and bumps
-- its frequency/confidence atomically. Confidence = least(1, round(freq/5, 2)),
-- matching vocabularyConfidence() in src/lib/ai/vocabulary.ts.
--
-- Security:
--   * The owner is always auth.uid() — never a client-supplied id.
--   * The clinic is always public.get_current_user_clinic_id().
--   * SECURITY INVOKER: the RLS insert/update policies above already permit a user
--     to write their own personal rows, so no elevated privilege is needed; RLS
--     stays in force as a second line of defence.
--   * search_path is locked and every object is schema-qualified.
create or replace function public.learn_vocabulary_entry(
  p_kind     text,
  p_modality text,
  p_source   text,
  p_target   text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_clinic uuid := public.get_current_user_clinic_id();
  v_user   uuid := auth.uid();
  v_id     uuid;
begin
  if v_clinic is null or v_user is null then
    return null;
  end if;
  if p_source is null or pg_catalog.btrim(p_source) = ''
     or p_target is null or pg_catalog.btrim(p_target) = '' then
    return null;
  end if;

  insert into public.vocabulary_entries
    (clinic_id, user_id, kind, modality, source_text, target_text,
     frequency, confidence, last_used_at, created_by)
  values
    (v_clinic, v_user, coalesce(p_kind, 'word'), p_modality,
     pg_catalog.btrim(p_source), pg_catalog.btrim(p_target),
     1, 0.200, pg_catalog.now(), v_user)
  on conflict (
    clinic_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    coalesce(modality, ''),
    lower(source_text)
  )
  do update set
    frequency    = public.vocabulary_entries.frequency + 1,
    target_text  = excluded.target_text,
    confidence   = least(1.0, round((public.vocabulary_entries.frequency + 1) / 5.0, 2)),
    last_used_at = pg_catalog.now(),
    updated_at   = pg_catalog.now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.learn_vocabulary_entry(text, text, text, text) is
  'Upserts a personal vocabulary entry for the authenticated radiologist and '
  'increments its frequency/confidence. Owner and clinic are derived server-side.';

revoke all     on function public.learn_vocabulary_entry(text, text, text, text) from public;
grant  execute on function public.learn_vocabulary_entry(text, text, text, text) to authenticated;


-- ─── Structural verification (runs at migration time) ─────────────────────────
do $$
declare
  v_rls    boolean;
  v_secdef boolean;
begin
  select c.relrowsecurity into v_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'vocabulary_entries';

  if v_rls is null then
    raise exception 'vocabulary_entries table was not created';
  end if;
  if not v_rls then
    raise exception 'vocabulary_entries must have row level security enabled';
  end if;

  select p.prosecdef into v_secdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'learn_vocabulary_entry';

  if v_secdef is null then
    raise exception 'learn_vocabulary_entry was not created';
  end if;
  if v_secdef then
    raise exception 'learn_vocabulary_entry must be SECURITY INVOKER';
  end if;

  raise notice 'vocabulary_entries + learn_vocabulary_entry: RLS on, SECURITY INVOKER OK';
end;
$$;
