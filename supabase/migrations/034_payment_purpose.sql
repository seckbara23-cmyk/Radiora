-- Phase 5D — record WHY each payment happens (subscription / renewal / upgrade).
--
-- The Wave + Orange Money rails are identical; what differs commercially is the
-- intent. Tagging every payment and attempt with a purpose makes the three flows
-- the spec lists for Orange Money first-class and auditable. Upgrades also carry
-- the target plan so confirming the payment switches the subscription.

alter table public.payments
  add column if not exists purpose text not null default 'subscription'
    check (purpose in ('subscription', 'renewal', 'upgrade')),
  add column if not exists target_plan_id text references public.plans(id);

alter table public.payment_attempts
  add column if not exists purpose text not null default 'subscription'
    check (purpose in ('subscription', 'renewal', 'upgrade'));

create index if not exists payments_purpose_idx on public.payments (purpose);

do $$
begin
  raise notice 'payment purpose + target_plan_id columns ready';
end;
$$;
