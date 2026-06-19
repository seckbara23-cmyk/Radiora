-- Phase 5E — payment receipts.
--
-- Every successful payment (subscription / renewal / upgrade, via Wave, Orange
-- Money or manual reconcile) produces a receipt. A clinic_admin can read their own
-- clinic's receipts; mutations happen through the service-role payment path only.
-- Receipts carry billing data exclusively — never PHI.

create table if not exists public.receipts (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  payment_id  uuid references public.payments(id) on delete set null,
  invoice_id  uuid references public.invoices(id) on delete set null,
  number      text not null unique,        -- REC-YYYYMM-####
  amount_xof  integer not null default 0,
  currency    text not null default 'XOF',
  issued_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists receipts_clinic_idx on public.receipts (clinic_id);
-- One receipt per payment (guards against a manual + webhook double-confirm).
create unique index if not exists receipts_payment_uidx
  on public.receipts (payment_id) where payment_id is not null;

alter table public.receipts enable row level security;

-- READ = own clinic OR super_admin (service-role bypasses RLS for the payment path).
drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts
  for select using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

drop policy if exists receipts_admin_write on public.receipts;
create policy receipts_admin_write on public.receipts
  for all using (public.is_super_admin()) with check (public.is_super_admin());

do $$
begin
  raise notice 'receipts table ready';
end;
$$;
