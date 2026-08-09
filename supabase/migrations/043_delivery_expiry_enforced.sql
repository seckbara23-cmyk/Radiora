-- =============================================================================
-- Migration 043: R0.8B — database-enforced delivery expiry
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 042)
--
-- WHY:
--   R0.5 made expiry mandatory in the APPLICATION (resolveExpiryDays: default
--   30 days, hard cap 90). Production schema inspection confirmed the column is
--   still nullable:
--
--       expires_at | timestamp with time zone | YES
--
--   So a direct SQL or PostgREST write — or any future code path that forgets
--   the helper — can still mint a link to a patient's frozen report that never
--   expires. This closes that gap at the last line of defence.
--
-- WHAT:
--   1. Backfills existing NULL expires_at (policy below).
--   2. Makes expires_at NOT NULL.
--   3. Adds CHECK report_deliveries_expiry_window:
--        expires_at > created_at
--        AND expires_at <= created_at + interval '90 days'
--
-- BACKFILL POLICY (conservative — old links are NOT given a new long life):
--   For each row with a NULL expires_at, expiry becomes the EARLIER of
--   created_at + 30 days and the migration execution time. In practice every
--   such row predates this migration, so almost all of them land on "now" and
--   are therefore already expired the moment the migration commits — a legacy
--   link stops working rather than silently gaining another month.
--
--   If that value would not be strictly greater than created_at (a row created
--   in the same instant, or with a created_at at/after now), it is given the
--   minimum valid timestamp (created_at + 1 second) AND revoked immediately,
--   because a link that cannot be given a meaningful lifetime must not stay
--   openable. Rows already revoked keep their original revoked_at — revocation
--   is never overwritten, and revoked links stay revoked either way.
--
--   No token, password hash or recipient value is read, written or logged here.
--
-- RLS is untouched: this migration adds no policy and drops none. The
-- restricted report_deliveries_select from 040 remains as applied.
--
-- Forward-only. Existing rows with a valid expires_at are left exactly as they
-- are (the CHECK is validated against them — see the pre-flight report below).
-- =============================================================================

-- ── 0. Pre-flight visibility (counts only — never row contents) ───────────────

do $$
declare
  v_null    bigint;
  v_invalid bigint;
begin
  select count(*) into v_null
    from public.report_deliveries where expires_at is null;

  select count(*) into v_invalid
    from public.report_deliveries
   where expires_at is not null
     and (expires_at <= created_at
          or expires_at > created_at + interval '90 days');

  raise notice 'R0.8B pre-flight: % row(s) with NULL expiry to backfill', v_null;
  raise notice 'R0.8B pre-flight: % existing row(s) outside the new window', v_invalid;
end;
$$;

-- ── 1. Backfill NULL expiry ───────────────────────────────────────────────────

with target as (
  select id,
         created_at,
         least(created_at + interval '30 days', now()) as candidate
    from public.report_deliveries
   where expires_at is null
)
update public.report_deliveries d
   set expires_at = case
                      when t.candidate > t.created_at then t.candidate
                      else t.created_at + interval '1 second'
                    end,
       -- A row that could not be given a meaningful lifetime is revoked now.
       -- Never overwrite an existing revocation.
       revoked_at = case
                      when t.candidate > t.created_at then d.revoked_at
                      else coalesce(d.revoked_at, now())
                    end
  from target t
 where d.id = t.id;

-- ── 2. Legacy rows that predate the 90-day rule ───────────────────────────────
-- An already-expired legacy row can sit outside the window (e.g. a hand-written
-- 1-year link). Clamp ONLY such rows to the maximum, so the constraint can be
-- created without deleting or hiding history. This never EXTENDS a link: the
-- clamp can only shorten, and anything already past its expiry stays expired.

update public.report_deliveries
   set expires_at = created_at + interval '90 days'
 where expires_at is not null
   and expires_at > created_at + interval '90 days';

-- A row whose expiry is at/before its creation is meaningless; give it the
-- minimum valid value and make sure it is revoked.
update public.report_deliveries
   set expires_at = created_at + interval '1 second',
       revoked_at = coalesce(revoked_at, now())
 where expires_at is not null
   and expires_at <= created_at;

-- ── 3. Enforce ────────────────────────────────────────────────────────────────

alter table public.report_deliveries
  alter column expires_at set not null;

alter table public.report_deliveries
  drop constraint if exists report_deliveries_expiry_window;

alter table public.report_deliveries
  add constraint report_deliveries_expiry_window
  check (
    expires_at > created_at
    and expires_at <= created_at + interval '90 days'
  );

comment on column public.report_deliveries.expires_at is
  'Mandatory link lifetime. NOT NULL and bounded by report_deliveries_expiry_window (> created_at, <= created_at + 90 days) so no code path or direct SQL write can create a never-expiring link to a patient report (R0.8B).';

-- ── 4. Self-verification ──────────────────────────────────────────────────────

do $$
declare
  v_nullable text;
  v_ok       boolean;
begin
  select is_nullable into v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'report_deliveries'
     and column_name = 'expires_at';

  if v_nullable is distinct from 'NO' then
    raise exception 'MIGRATION SELF-CHECK FAILED: report_deliveries.expires_at is still nullable';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'report_deliveries_expiry_window'
      and conrelid = 'public.report_deliveries'::regclass
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: report_deliveries_expiry_window constraint missing';
  end if;

  -- No row may remain outside the window.
  select not exists (
    select 1 from public.report_deliveries
     where expires_at <= created_at
        or expires_at > created_at + interval '90 days'
  ) into v_ok;

  if not v_ok then
    raise exception 'MIGRATION SELF-CHECK FAILED: rows remain outside the expiry window';
  end if;

  raise notice 'R0.8B: expires_at is NOT NULL and bounded; all rows satisfy the window.';
end;
$$;
