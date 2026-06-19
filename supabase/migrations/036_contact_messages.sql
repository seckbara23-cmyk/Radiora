-- Phase 5H — public marketing contact / lead capture.
--
-- Visitors on the public marketing site can send an inquiry. Submissions are
-- written from an unauthenticated server action via the service-role client, so
-- the table has RLS enabled with NO insert policy (inserts only ever happen
-- through the trusted server action). Only platform super admins may read the
-- leads — this feeds Customer Success (Phase 5J). Carries no clinical content.

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  clinic_name text,
  message     text not null,
  locale      text not null default 'fr',
  source      text not null default 'marketing_contact',
  status      text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at  timestamptz not null default now()
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);
create index if not exists contact_messages_status_idx  on public.contact_messages (status);

alter table public.contact_messages enable row level security;

-- Super admins (platform owners) can read and manage leads. No insert policy:
-- the public marketing form writes via the service-role client only.
drop policy if exists "contact_messages_super_admin_select" on public.contact_messages;
create policy "contact_messages_super_admin_select" on public.contact_messages
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists "contact_messages_super_admin_update" on public.contact_messages;
create policy "contact_messages_super_admin_update" on public.contact_messages
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
