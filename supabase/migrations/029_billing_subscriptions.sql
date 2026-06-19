-- Phase 4A — Billing & subscription domain for the Radiora SaaS platform.
--
-- The tenant boundary remains the `clinics` table. This migration adds the
-- platform billing layer on top of it:
--   plans            — the subscription catalogue (Starter / Professional / Enterprise)
--   subscriptions    — one current billing record per clinic (lifecycle source of truth)
--   invoices         — monthly charges
--   payments         — successful/failed settlements against invoices
--   payment_attempts — every gateway attempt (Wave / Orange Money / card)
--
-- Security model:
--   * A clinic_admin may READ their own clinic's billing data (for the billing
--     dashboard) but may NEVER mutate it — lifecycle changes happen through the
--     service-role client / super_admin only.
--   * super_admin (platform admins) may read all billing data, but the existing
--     clinical RLS still hides every clinic's PHI from them: platform admins see
--     subscriptions, usage and billing — never report findings or patient data.
--   * plans are world-readable to authenticated users (needed to render pricing).

-- ─── plans ────────────────────────────────────────────────────────────────────
create table if not exists public.plans (
  id               text primary key,            -- 'starter' | 'professional' | 'enterprise'
  name             text not null,
  description      text not null default '',
  price_xof        integer not null default 0,  -- monthly price in CFA francs (XOF)
  max_radiologists integer,                      -- null = unlimited
  max_secretaries  integer,                      -- null = unlimited
  features         jsonb not null default '[]',
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── subscriptions ────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null unique references public.clinics(id) on delete cascade,
  plan_id            text not null references public.plans(id),
  status             text not null default 'trial'
                       check (status in ('trial', 'active', 'grace', 'suspended', 'cancelled')),
  trial_ends_at      timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_ends_at      timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);

-- ─── invoices ─────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  number          text not null unique,        -- human-facing invoice number
  amount_xof      integer not null default 0,
  currency        text not null default 'XOF',
  status          text not null default 'open'
                    check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  period_start    timestamptz,
  period_end      timestamptz,
  due_date        timestamptz,
  issued_at       timestamptz not null default now(),
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists invoices_clinic_idx on public.invoices (clinic_id);
create index if not exists invoices_status_idx on public.invoices (status);

-- ─── payments ─────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  invoice_id   uuid references public.invoices(id) on delete set null,
  amount_xof   integer not null default 0,
  currency     text not null default 'XOF',
  method       text not null default 'manual'
                 check (method in ('wave', 'orange_money', 'card', 'manual')),
  status       text not null default 'pending'
                 check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  provider_ref text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists payments_clinic_idx on public.payments (clinic_id);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

-- ─── payment_attempts ─────────────────────────────────────────────────────────
create table if not exists public.payment_attempts (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  invoice_id      uuid references public.invoices(id) on delete set null,
  method          text not null
                    check (method in ('wave', 'orange_money', 'card', 'manual')),
  status          text not null default 'initiated'
                    check (status in ('initiated', 'pending', 'succeeded', 'failed')),
  provider_ref    text,
  failure_reason  text,
  created_at      timestamptz not null default now()
);

create index if not exists payment_attempts_clinic_idx on public.payment_attempts (clinic_id);
create index if not exists payment_attempts_invoice_idx on public.payment_attempts (invoice_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists plans_updated_at on public.plans;
create trigger plans_updated_at before update on public.plans
  for each row execute function public.handle_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.handle_updated_at();

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.handle_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.plans             enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.invoices          enable row level security;
alter table public.payments          enable row level security;
alter table public.payment_attempts  enable row level security;

-- plans: readable by any authenticated user; only super_admin may write.
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select using (auth.uid() is not null);

drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- subscriptions / invoices / payments / payment_attempts:
-- READ = own clinic OR super_admin. WRITE = super_admin only (service-role
-- bypasses RLS for automated billing jobs).
do $$
declare
  t text;
begin
  foreach t in array array['subscriptions', 'invoices', 'payments', 'payment_attempts']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format($f$
      create policy %1$I_select on public.%1$I
        for select using (
          clinic_id = public.get_current_user_clinic_id()
          or public.is_super_admin()
        )
    $f$, t);

    execute format('drop policy if exists %I_admin_write on public.%I', t, t);
    execute format($f$
      create policy %1$I_admin_write on public.%1$I
        for all using (public.is_super_admin()) with check (public.is_super_admin())
    $f$, t);
  end loop;
end;
$$;

-- ─── Seed the plan catalogue ──────────────────────────────────────────────────
insert into public.plans (id, name, description, price_xof, max_radiologists, max_secretaries, features, sort_order)
values
  ('starter', 'Starter',
   'Radiologues indépendants et petits centres d''imagerie.',
   25000, 1, 2,
   '["1 radiologue","2 secrétaires","Comptes rendus illimités","Dictée mobile","Structuration IA","Exports PDF/DOCX","Transmission sécurisée"]'::jsonb,
   1),
  ('professional', 'Professional',
   'Centres d''imagerie et cabinets multi-radiologues.',
   75000, 10, null,
   '["Jusqu''à 10 radiologues","Secrétaires illimités","Analytique","Mémoire de vocabulaire","Image de marque","Notifications WhatsApp"]'::jsonb,
   2),
  ('enterprise', 'Enterprise',
   'Hôpitaux et grands départements d''imagerie.',
   0, null, null,
   '["Utilisateurs illimités","Support multi-sites","Intégration PACS (à venir)","SLA personnalisé"]'::jsonb,
   3)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_xof = excluded.price_xof,
  max_radiologists = excluded.max_radiologists,
  max_secretaries = excluded.max_secretaries,
  features = excluded.features,
  sort_order = excluded.sort_order;

-- ─── Backfill: one subscription per existing clinic ───────────────────────────
-- Map the clinic's current status onto the subscription lifecycle so no existing
-- tenant is accidentally locked out. Trials get a 30-day window from creation.
insert into public.subscriptions (clinic_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
select
  c.id,
  c.plan::text,
  case c.status::text
    when 'active'    then 'active'
    when 'trial'     then 'trial'
    when 'suspended' then 'suspended'
    when 'inactive'  then 'cancelled'
    else 'trial'
  end,
  case when c.status::text = 'trial' then coalesce(c.created_at, now()) + interval '30 days' else null end,
  case when c.status::text = 'active' then coalesce(c.created_at, now()) else null end,
  case when c.status::text = 'active' then coalesce(c.created_at, now()) + interval '30 days' else null end
from public.clinics c
on conflict (clinic_id) do nothing;

-- ─── Structural verification ──────────────────────────────────────────────────
do $$
declare
  v_plan_count integer;
begin
  select count(*) into v_plan_count from public.plans;
  if v_plan_count < 3 then
    raise exception 'plans seed failed: expected >= 3 plans, found %', v_plan_count;
  end if;
  raise notice 'billing: % plans seeded; subscriptions backfilled OK', v_plan_count;
end;
$$;
