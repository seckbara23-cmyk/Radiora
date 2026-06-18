-- Feature 10 — medical safety hardening.
-- Enrich report version snapshots with the action that produced them and a
-- machine-readable diff, so the version history is a full audit trail of every
-- save / validation / signing / amendment.

alter table public.report_versions
  add column if not exists action text,                     -- saved | signed | amended
  add column if not exists diff   jsonb not null default '{}'::jsonb;

comment on column public.report_versions.action is
  'What produced this snapshot: saved | signed | amended (Feature 10).';
comment on column public.report_versions.diff is
  'Diff metadata, e.g. { changedSections: [...], previousVersion: n } (Feature 10).';

-- Helpful index for querying a report''s signing/amendment events.
create index if not exists report_versions_action_idx
  on public.report_versions (report_id, action);
