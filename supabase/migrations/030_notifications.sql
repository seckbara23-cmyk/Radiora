-- Phase 4E/4F — notifications outbox.
--
-- A single generic table backs both the automated billing reminders (Phase 4E:
-- trial-ending, renewal, grace warnings) and the clinic-configurable WhatsApp
-- notifications (Phase 4F: report validated/delivered, appointment reminder,
-- critical finding). Rows are created as `pending` by the billing-cycle runner
-- or workflow hooks, then a delivery step marks them `sent`/`failed`. The table
-- never stores clinical findings — only short, already-authorised summaries.

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  type            text not null
                    check (type in (
                      'trial_ending', 'renewal_reminder', 'grace_warning',
                      'invoice_issued', 'suspended', 'payment_failed',
                      'report_validated', 'report_delivered',
                      'appointment_reminder', 'critical_finding'
                    )),
  channel         text not null default 'in_app'
                    check (channel in ('in_app', 'whatsapp', 'email')),
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'failed', 'skipped')),
  reminder_day    integer,                 -- 7 / 3 / 0 milestone for reminders
  title           text,
  body            text,
  payload         jsonb not null default '{}',
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_clinic_idx on public.notifications (clinic_id);
create index if not exists notifications_status_idx on public.notifications (status);
create index if not exists notifications_type_idx on public.notifications (type);

-- Dedup guard for milestone reminders: at most one row per
-- (subscription, type, reminder_day) so a billing cycle re-run never
-- double-sends the 7/3/0-day reminders.
create unique index if not exists notifications_reminder_unique
  on public.notifications (subscription_id, type, reminder_day)
  where subscription_id is not null and reminder_day is not null;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

-- READ = own clinic OR super_admin.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- WRITE = super_admin only (service-role bypasses RLS for the automated runner).
drop policy if exists notifications_admin_write on public.notifications;
create policy notifications_admin_write on public.notifications
  for all using (public.is_super_admin()) with check (public.is_super_admin());
