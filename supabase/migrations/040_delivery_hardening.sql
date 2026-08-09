-- =============================================================================
-- Migration 040: R0.5 — secure-delivery hardening
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 039)
--
-- WHY (audit finding C5):
--   • The patient-channel password is a deterministic DDMMYYYY birth date and
--     both public endpoints accepted unlimited guesses — a leaked token could
--     be brute-forced in seconds.
--   • report_deliveries_select had NO role restriction while the staff query
--     selected `token` AND `password_hash`, so any viewer/technician in the
--     clinic could read every secure link and attack the hash offline.
--
-- WHAT:
--   1. Durable brute-force counters on the delivery row (failed_attempts,
--      locked_until). Deliberately DB-backed, not in-process: the app runs
--      serverless, where an in-memory limiter resets on cold start and is not
--      shared across instances.
--   2. Tightens the SELECT policy to the same roles that may already create,
--      update and delete deliveries (clinic_admin / radiologist / super_admin).
--
-- Forward-only and additive. The public patient path is unaffected: it reads
-- and writes via the service-role client, which bypasses RLS by design.
-- =============================================================================

-- ── 1. Brute-force lockout state ──────────────────────────────────────────────

alter table public.report_deliveries
  add column if not exists failed_attempts integer     not null default 0,
  add column if not exists locked_until    timestamptz;

comment on column public.report_deliveries.failed_attempts is
  'Consecutive failed password attempts on the public gate; reset on success (R0.5).';
comment on column public.report_deliveries.locked_until is
  'When set and in the future, the public password gate refuses attempts (R0.5).';

-- ── 2. Restrict who can read delivery secrets ─────────────────────────────────
-- The row carries the link token; only the roles that may issue or revoke a
-- delivery need to read it. Mirrors report_deliveries_insert/update/delete.

drop policy if exists report_deliveries_select on public.report_deliveries;
create policy report_deliveries_select on public.report_deliveries
  for select using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
    )
    or public.is_super_admin()
  );

-- ── 3. Structural self-verification ───────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_deliveries'
      and column_name = 'failed_attempts'
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: report_deliveries.failed_attempts missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'report_deliveries'
      and policyname = 'report_deliveries_select'
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: report_deliveries_select policy missing';
  end if;
end;
$$;
