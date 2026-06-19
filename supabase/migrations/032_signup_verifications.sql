-- Phase 5B — public self-service onboarding: verification codes.
--
-- Backs the "verify email" and "verify phone" steps of the public free-trial
-- signup. Each row is a one-time code (stored only as a salted SHA-256 hash,
-- never in clear) bound to a contact value and channel, with a short TTL and a
-- bounded attempt counter.
--
-- SECURITY: this table is touched ONLY by server actions running under the
-- service-role key (which bypasses RLS). RLS is enabled with NO policies so that
-- the anon / authenticated roles can never read or write codes directly — a
-- browser can request and verify a code only through the server action, which
-- compares hashes and enforces the rate limits. No clinical data lives here.

create table if not exists public.signup_verifications (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  channel      text not null check (channel in ('email', 'phone')),
  target       text not null,           -- the email or normalised phone being verified
  code_hash    text not null,           -- salted sha-256 of the 6-digit code
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists signup_verifications_email_channel_idx
  on public.signup_verifications (email, channel, created_at desc);

-- RLS on, deliberately NO policies → only the service-role client may touch it.
alter table public.signup_verifications enable row level security;
