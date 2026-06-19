-- F11 — Radiologist profile & signature preferences.
--
-- Extends profiles with the identity + signature-style fields a radiologist
-- configures once and that are auto-inserted on every exported report.
-- All additive, all defaulted, so existing rows stay valid. No new RLS needed:
-- a user may already update their own profile (001) and a clinic_admin may
-- update profiles within their clinic (003).

alter table public.profiles
  add column if not exists title_prefix     text not null default 'Dr',   -- 'Dr' | 'Pr'
  add column if not exists signature_style  text not null default 'full', -- 'full' | 'initials_surname' | 'custom'
  add column if not exists signature_custom text not null default '',     -- free text when style = 'custom'
  add column if not exists phone            text not null default '',
  add column if not exists institution      text not null default '',
  add column if not exists country          text not null default '';
