-- F12 — Hospital Header Library.
--
-- A clinic can pick from a library of institution letterheads when exporting a
-- report (or export with no header at all). Global seed rows (clinic_id NULL) are
-- shared with every clinic; clinic-scoped rows are private to that clinic.

create table if not exists public.hospital_headers (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references public.clinics(id) on delete cascade,  -- null = global
  name        text not null,                       -- institution / établissement
  overline    text not null default '',            -- lines above the name (e.g. command)
  department  text not null default '',            -- imaging department / service
  subtitle    text not null default '',            -- line below dept (e.g. equipment)
  address     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  logo_url    text,                                -- path in clinic-branding bucket or URL
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hospital_headers_clinic_idx
  on public.hospital_headers (clinic_id) where clinic_id is not null;

drop trigger if exists hospital_headers_updated_at on public.hospital_headers;
create trigger hospital_headers_updated_at
  before update on public.hospital_headers
  for each row execute function public.handle_updated_at();

alter table public.hospital_headers enable row level security;

-- Read: global seeds, your clinic's headers, or super_admin sees all.
drop policy if exists hospital_headers_select on public.hospital_headers;
create policy hospital_headers_select on public.hospital_headers
  for select using (
    clinic_id is null
    or clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- Write: only your own clinic's rows, and only admins.
drop policy if exists hospital_headers_insert on public.hospital_headers;
create policy hospital_headers_insert on public.hospital_headers
  for insert with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

drop policy if exists hospital_headers_update on public.hospital_headers;
create policy hospital_headers_update on public.hospital_headers
  for update using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

drop policy if exists hospital_headers_delete on public.hospital_headers;
create policy hospital_headers_delete on public.hospital_headers
  for delete using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

-- Keep global seeds unique by name so re-running this migration never duplicates.
create unique index if not exists hospital_headers_global_name_uq
  on public.hospital_headers (name) where clinic_id is null;

-- ── Seed: the two pilot institutions (global, clinic_id NULL) ──
insert into public.hospital_headers (clinic_id, name, overline, department, subtitle, phone, email, sort_order)
values
  (
    null,
    'ETABLISSEMENT HOSPITALIER MILITAIRE DE ZIGUINCHOR',
    E'ETAT MAJOR GENERAL DES ARMEES\nZONE MILITAIRE 5',
    'SERVICE D’IMAGERIE MEDICALE',
    '',
    '76 625 98 13',
    'dssacmiaz@gmail.com',
    1
  ),
  (
    null,
    'HOPITAL PRINCIPAL DE DAKAR',
    '',
    'DEPARTEMENT D’IMAGERIE MEDICALE',
    'IRM 3 Tesla – Scanner 128 coupes – Mammographie et Radiographie digitales – Echographie doppler – Radiologie Interventionnelle',
    '33 839 58 38',
    '',
    2
  )
on conflict (name) where clinic_id is null do nothing;
