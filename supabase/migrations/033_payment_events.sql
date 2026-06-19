-- Phase 5C — payment provider webhook ledger (Wave first, Orange Money next).
--
-- Every event a provider POSTs to our webhook is recorded here BEFORE we act on
-- it, satisfying "audit every payment event" and giving us idempotency + safe
-- retries: a provider that re-delivers the same event (its standard retry on a
-- non-2xx, or a duplicate) hits the unique (provider, event_id) constraint and we
-- short-circuit instead of double-confirming a subscription.
--
-- Security: this table is touched ONLY by the service-role webhook handler. RLS is
-- enabled with NO policies, so authenticated users (including super_admin via the
-- session client) can never read or write it directly — the raw provider payload
-- never leaks. It carries no PHI (billing references only).

create table if not exists public.payment_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null
                    check (provider in ('wave', 'orange_money')),
  event_id        text not null,             -- provider's unique event id (idempotency key)
  event_type      text not null,             -- raw provider event-type string
  provider_ref    text,                      -- our payments.provider_ref this event targets
  payment_id      uuid references public.payments(id) on delete set null,
  clinic_id       uuid references public.clinics(id) on delete set null,
  signature_valid boolean not null default false,
  outcome         text not null              -- how the handler resolved this event
                    check (outcome in ('success', 'failure', 'ignored', 'unmatched', 'rejected', 'duplicate')),
  payload         jsonb,
  received_at     timestamptz not null default now()
);

-- Idempotency: a given provider never processes the same event id twice.
create unique index if not exists payment_events_provider_event_uidx
  on public.payment_events (provider, event_id);
create index if not exists payment_events_ref_idx on public.payment_events (provider_ref);
create index if not exists payment_events_clinic_idx on public.payment_events (clinic_id);

-- RLS on, no policies → service-role only.
alter table public.payment_events enable row level security;

do $$
begin
  raise notice 'payment_events ledger ready (service-role only)';
end;
$$;
