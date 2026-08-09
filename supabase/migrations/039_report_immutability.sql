-- =============================================================================
-- Migration 039: R0.2 — finalized-report immutability at the database level
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor (after 038 — reuses is_service_context)
--
-- WHY (audit findings C2 / H2 / H3 / M3):
--   • acceptStructuredReport / acceptHPDDraft could rewrite a FINALIZED
--     report's clinical content with status and signed_at intact — exports
--     then rendered clean, signed output the radiologist never validated.
--   • RLS lets clinic_admin UPDATE reports, so a clinic_admin could set
--     status = 'finalized' (or edit finalized content) via direct PostgREST,
--     bypassing the app's radiologist-only signing gate.
--   • report_versions never preserved structured_data or the original
--     signing timestamp, so amendments lost the signed document's HPD JSON
--     and signed_at forever.
--
-- WHAT:
--   1. report_versions gains structured_data + signed_at so a snapshot
--      preserves the ENTIRE signed document, including when it was signed.
--   2. enforce_report_immutability() BEFORE UPDATE trigger on reports:
--        a. only a radiologist may transition a report INTO 'finalized';
--        b. while finalized, the clinical columns (findings, impression,
--           recommendations, structured_data, exam_type, ai_draft), the
--           record linkage (study_id, patient_id, author_id) and signed_at
--           are immutable;
--        c. the ONLY status transition out of 'finalized' is 'amended', and
--           that transition may not smuggle content changes in the same
--           statement (the app amends first, then edits as a draft);
--        d. trusted server contexts (service_role / direct DB) bypass the
--           guard EXPLICITLY via is_service_context() — never via a NULL
--           fail-open: an unidentifiable API caller is rejected.
--
-- App-level counterparts land in the same slice: evaluateReportWrite()
-- (lib/safety/immutability.ts) + createReportVersion() (lib/reports/versioning.ts).
-- Forward-only: columns are additive; no data is modified.
-- =============================================================================

-- ── 1. Version snapshots preserve the full signed document ────────────────────

alter table public.report_versions
  add column if not exists structured_data jsonb,
  add column if not exists signed_at       timestamptz;

comment on column public.report_versions.structured_data is
  'Full structured HPD payload at snapshot time — the legacy findings/impression columns alone cannot reconstruct a signed structured report (R0.2).';
comment on column public.report_versions.signed_at is
  'The report''s signed_at at snapshot time. Preserves the ORIGINAL signing timestamp through the amendment history (the live row''s signed_at is cleared when a report is re-opened).';

-- ── 2. Immutability trigger on reports ────────────────────────────────────────

create or replace function public.enforce_report_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role      text;
  v_content_changed boolean;
  v_linkage_changed boolean;
begin
  -- Trusted server contexts bypass explicitly (service_role client, SQL
  -- editor, migrations). Everything else — including anon and any caller
  -- whose role cannot be resolved — is subject to the guard.
  if public.is_service_context() then
    return new;
  end if;

  v_actor_role := coalesce(public.get_current_user_role()::text, '');

  -- INSERT: a report may not be BORN finalized by a non-radiologist, and an
  -- API caller may never supply their own signing timestamp.
  if tg_op = 'INSERT' then
    if new.status = 'finalized' then
      if v_actor_role <> 'radiologist' then
        raise exception 'Only a radiologist can finalize (sign) a report'
          using errcode = '42501';
      end if;
      new.signed_at := now();
    end if;
    return new;
  end if;

  v_content_changed :=
       new.findings        is distinct from old.findings
    or new.impression      is distinct from old.impression
    or new.recommendations is distinct from old.recommendations
    or new.structured_data is distinct from old.structured_data
    or new.exam_type       is distinct from old.exam_type
    or new.ai_draft        is distinct from old.ai_draft;

  v_linkage_changed :=
       new.study_id   is distinct from old.study_id
    or new.patient_id is distinct from old.patient_id
    or new.author_id  is distinct from old.author_id;

  -- a. Signing authority: only a radiologist finalizes. NULL/unknown roles
  --    fail CLOSED (coalesce to '' above), unlike the fail-open pattern the
  --    audit flagged in the vacation trigger.
  if new.status = 'finalized' and old.status is distinct from 'finalized' then
    if v_actor_role <> 'radiologist' then
      raise exception 'Only a radiologist can finalize (sign) a report'
        using errcode = '42501';
    end if;
    -- The signing timestamp is set by the system at the moment of signing —
    -- an API caller can never supply (or backdate) it.
    new.signed_at := now();
  end if;

  -- b + c. A finalized report is immutable outside the amendment workflow.
  if old.status = 'finalized' then
    if new.status = 'finalized' then
      if v_content_changed or v_linkage_changed
         or new.signed_at is distinct from old.signed_at then
        raise exception 'A finalized report is immutable — use the amendment workflow'
          using errcode = '42501';
      end if;
    elsif new.status = 'amended' then
      -- Re-opening is a pure status transition; content edits happen
      -- afterwards, as a draft, with their own version snapshots.
      -- (handle_report_finalized clears signed_at in this same statement —
      -- that trigger-driven change is expected and not treated as tampering.)
      if v_content_changed or v_linkage_changed then
        raise exception 'Amendment must re-open the report before changing content'
          using errcode = '42501';
      end if;
    else
      raise exception 'A finalized report can only transition to amended'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_report_immutability() is
  'R0.2 — DB-enforced clinical immutability: radiologist-only finalization; finalized content/linkage/signed_at frozen; the only exit from finalized is the amendment workflow. Service contexts bypass explicitly via is_service_context().';

drop trigger if exists reports_immutability_guard on public.reports;

create trigger reports_immutability_guard
  before insert or update on public.reports
  for each row execute function public.enforce_report_immutability();

-- Trigger order note: BEFORE UPDATE triggers fire alphabetically —
-- reports_finalized (001, stamps/clears signed_at) → reports_immutability_guard
-- (this) → reports_updated_at (001). The guard therefore sees the
-- trigger-maintained signed_at only on transitions, where it does not compare
-- signed_at; in the finalized→finalized branch reports_finalized leaves
-- signed_at untouched, so any signed_at difference there is caller tampering.

-- ── 3. Structural self-verification ───────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'reports_immutability_guard'
      and tgrelid = 'public.reports'::regclass
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: reports_immutability_guard trigger missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_versions'
      and column_name = 'structured_data'
  ) then
    raise exception 'MIGRATION SELF-CHECK FAILED: report_versions.structured_data missing';
  end if;
end;
$$;
