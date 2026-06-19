-- Phase 4F — clinic-configurable WhatsApp notification settings.
--
-- Each clinic decides whether WhatsApp notifications are on and which of the
-- four events trigger a message: report validated, report delivered,
-- appointment reminder, critical finding alert. Messages are queued into the
-- Phase 4E notifications outbox (channel 'whatsapp'); no real WhatsApp API is
-- contacted and NO clinical content is ever placed in a message — only short,
-- already-authorised summaries (e.g. "your report is ready", a reference number).
--
-- WhatsApp is a Professional/Enterprise feature; the application layer also
-- checks the plan, but the toggles live here so a clinic_admin can configure them.

create table if not exists public.notification_settings (
  clinic_id              uuid primary key references public.clinics(id) on delete cascade,
  whatsapp_enabled       boolean not null default false,
  whatsapp_number        text,
  on_report_validated    boolean not null default true,
  on_report_delivered    boolean not null default true,
  on_appointment_reminder boolean not null default false,
  on_critical_finding    boolean not null default true,
  updated_at             timestamptz not null default now()
);

drop trigger if exists notification_settings_updated_at on public.notification_settings;
create trigger notification_settings_updated_at before update on public.notification_settings
  for each row execute function public.handle_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.notification_settings enable row level security;

-- READ = own clinic OR super_admin.
drop policy if exists notification_settings_select on public.notification_settings;
create policy notification_settings_select on public.notification_settings
  for select using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- WRITE = the clinic's own clinic_admin, OR super_admin.
drop policy if exists notification_settings_write on public.notification_settings;
create policy notification_settings_write on public.notification_settings
  for all using (
    (clinic_id = public.get_current_user_clinic_id() and public.get_current_user_role() = 'clinic_admin')
    or public.is_super_admin()
  ) with check (
    (clinic_id = public.get_current_user_clinic_id() and public.get_current_user_role() = 'clinic_admin')
    or public.is_super_admin()
  );
