-- F17 — Secure Report Delivery.
--
-- A validated report can be delivered through a secure, optionally
-- password-protected, expiring link. We never transmit PHI to an external
-- service: a delivery is an in-app artifact (a token + access policy + an audit
-- trail). At creation time the PDF/DOCX are rendered with the SAME pipeline as the
-- F9 export and frozen into the private `report-deliveries` storage bucket, so the
-- file a patient downloads is byte-identical to the staff export and no anonymous
-- query ever touches the live report tables.
--
-- The public link path (/r/<token> and /api/delivery/<token>/file) reads this
-- table and the bucket through the service-role client server-side; RLS below
-- governs STAFF access only.

create table if not exists public.report_deliveries (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  report_id      uuid not null references public.reports(id) on delete cascade,
  channel        text not null default 'link'
                   check (channel in ('patient', 'physician', 'link')),
  recipient_label text not null default '',          -- name/contact typed by staff; never transmitted
  token          text not null unique,               -- secret part of the secure URL
  password_kind  text not null default 'none'
                   check (password_kind in ('none', 'custom', 'dob')),
  password_hash  text,                               -- scrypt$salt$hash, null when password_kind = none
  pdf_path       text,                               -- path in report-deliveries bucket
  docx_path      text,
  filename_base  text not null default 'compte-rendu',
  header_choice  text not null default '',           -- '' default | header id | 'none'
  expires_at     timestamptz,                        -- null = never expires
  opened_count   integer not null default 0,
  download_count integer not null default 0,
  last_accessed_at timestamptz,
  revoked_at     timestamptz,                        -- non-null = revoked
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists report_deliveries_report_idx
  on public.report_deliveries (report_id);
create index if not exists report_deliveries_clinic_idx
  on public.report_deliveries (clinic_id);
-- Token lookups happen on the public path via the service-role client; a plain
-- unique index already backs them.

drop trigger if exists report_deliveries_updated_at on public.report_deliveries;
create trigger report_deliveries_updated_at
  before update on public.report_deliveries
  for each row execute function public.handle_updated_at();

alter table public.report_deliveries enable row level security;

-- Read: staff see their own clinic's deliveries; super_admin sees all. (The public
-- patient path does NOT use these policies — it uses the service-role client.)
drop policy if exists report_deliveries_select on public.report_deliveries;
create policy report_deliveries_select on public.report_deliveries
  for select using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- Write: only radiologists / admins, only within their own clinic. (Secure
-- delivery never validates a report — that gate is enforced in the action layer
-- before a row is ever inserted.)
drop policy if exists report_deliveries_insert on public.report_deliveries;
create policy report_deliveries_insert on public.report_deliveries
  for insert with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

drop policy if exists report_deliveries_update on public.report_deliveries;
create policy report_deliveries_update on public.report_deliveries
  for update using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

drop policy if exists report_deliveries_delete on public.report_deliveries;
create policy report_deliveries_delete on public.report_deliveries
  for delete using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

-- Private bucket holding the frozen export files. No public access; both staff
-- writes and the public download path go through the service-role client.
insert into storage.buckets (id, name, public)
values ('report-deliveries', 'report-deliveries', false)
on conflict (id) do nothing;


-- ─── Structural verification (runs at migration time) ─────────────────────────
do $$
declare
  v_rls boolean;
begin
  select c.relrowsecurity into v_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'report_deliveries';

  if v_rls is null then
    raise exception 'report_deliveries table was not created';
  end if;
  if not v_rls then
    raise exception 'report_deliveries must have row level security enabled';
  end if;

  raise notice 'report_deliveries: created with RLS enabled OK';
end;
$$;
