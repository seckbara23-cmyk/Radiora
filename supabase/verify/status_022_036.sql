-- ============================================================================
-- Radiora — Migration status & verification for 022–036 (Phase 4 + Phase 5)
-- ============================================================================
-- Run this in the Supabase SQL editor.
--
--   SECTION 1 (structural) reads ONLY system catalogs, so it is safe to run at
--   ANY time — before applying (to see what is missing) or after (to confirm).
--   It returns one row per migration object: mig | feature | object | status.
--
--   SECTION 2 (data) reads the actual tables and is only meaningful AFTER the
--   migrations have been applied. Run it second.
--
-- Copy the SECTION 1 result back and it IS the migration status report.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — STRUCTURAL STATUS  (catalog-only · safe anytime)
-- ─────────────────────────────────────────────────────────────────────────────
with checks(mig, feature, object, present) as (
  -- helpers inlined per row:
  --   table  → to_regclass('public.x') is not null
  --   column → information_schema.columns
  --   routine→ information_schema.routines
  --   policy → pg_policies
  --   rls    → pg_class.relrowsecurity
  --   bucket → storage.buckets

  -- 022 — Report version audit
  select '022','Report version audit','column report_versions.action',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_versions' and column_name='action')
  union all select '022','Report version audit','column report_versions.diff',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_versions' and column_name='diff')

  -- 023 — Exam catalog
  union all select '023','Exam catalog','table exam_catalog',
         to_regclass('public.exam_catalog') is not null

  -- 024 — Template sections
  union all select '024','Template sections','column report_templates.indication_template',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_templates' and column_name='indication_template')
  union all select '024','Template sections','column report_templates.source',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_templates' and column_name='source')

  -- 025 — Hospital headers
  union all select '025','Hospital headers','table hospital_headers',
         to_regclass('public.hospital_headers') is not null

  -- 026 — Profile signature
  union all select '026','Profile signature','column profiles.title_prefix',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='title_prefix')
  union all select '026','Profile signature','column profiles.country',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='country')

  -- 027 — Vocabulary memory
  union all select '027','Vocabulary memory','table vocabulary_entries',
         to_regclass('public.vocabulary_entries') is not null
  union all select '027','Vocabulary memory','function learn_vocabulary_entry',
         exists(select 1 from information_schema.routines where routine_schema='public' and routine_name='learn_vocabulary_entry')

  -- 028 — Secure delivery
  union all select '028','Secure delivery','table report_deliveries',
         to_regclass('public.report_deliveries') is not null
  union all select '028','Secure delivery','storage bucket report-deliveries',
         exists(select 1 from storage.buckets where id='report-deliveries')

  -- 029 — Billing & subscriptions
  union all select '029','Billing & subscriptions','table plans',
         to_regclass('public.plans') is not null
  union all select '029','Billing & subscriptions','table subscriptions',
         to_regclass('public.subscriptions') is not null
  union all select '029','Billing & subscriptions','table invoices',
         to_regclass('public.invoices') is not null
  union all select '029','Billing & subscriptions','table payments',
         to_regclass('public.payments') is not null
  union all select '029','Billing & subscriptions','table payment_attempts',
         to_regclass('public.payment_attempts') is not null

  -- 030 — Notifications outbox
  union all select '030','Notifications','table notifications',
         to_regclass('public.notifications') is not null

  -- 031 — Notification settings
  union all select '031','Notification settings','table notification_settings',
         to_regclass('public.notification_settings') is not null

  -- 032 — Signup verifications (onboarding email/phone)
  union all select '032','Signup verifications','table signup_verifications',
         to_regclass('public.signup_verifications') is not null

  -- 033 — Payment events (Wave/Orange webhooks audit)
  union all select '033','Payment events','table payment_events',
         to_regclass('public.payment_events') is not null

  -- 034 — Payment purpose (subscription / renewal / upgrade)
  union all select '034','Payment purpose','column payments.purpose',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='purpose')
  union all select '034','Payment purpose','column payments.target_plan_id',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='target_plan_id')
  union all select '034','Payment purpose','column payment_attempts.purpose',
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='payment_attempts' and column_name='purpose')

  -- 035 — Receipts
  union all select '035','Receipts','table receipts',
         to_regclass('public.receipts') is not null

  -- 036 — Contact messages (marketing leads)
  union all select '036','Contact messages','table contact_messages',
         to_regclass('public.contact_messages') is not null
  union all select '036','Contact messages','RLS enabled on contact_messages',
         exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname='contact_messages' and c.relrowsecurity)
  union all select '036','Contact messages','policy contact_messages_super_admin_select',
         exists(select 1 from pg_policies where schemaname='public' and tablename='contact_messages' and policyname='contact_messages_super_admin_select')
  union all select '036','Contact messages','policy contact_messages_super_admin_update',
         exists(select 1 from pg_policies where schemaname='public' and tablename='contact_messages' and policyname='contact_messages_super_admin_update')
)
select
  mig                                    as "Migration",
  feature                                as "Affected feature",
  object                                 as "Object verified",
  case when present then '✅ OK' else '❌ MISSING' end as "Status"
from checks
order by mig, object;


-- Quick roll-up: how many objects are still missing (0 = fully applied).
with checks2(present) as (
  select to_regclass('public.exam_catalog')          is not null union all
  select to_regclass('public.hospital_headers')      is not null union all
  select to_regclass('public.vocabulary_entries')    is not null union all
  select to_regclass('public.report_deliveries')     is not null union all
  select to_regclass('public.plans')                 is not null union all
  select to_regclass('public.subscriptions')         is not null union all
  select to_regclass('public.invoices')              is not null union all
  select to_regclass('public.payments')              is not null union all
  select to_regclass('public.payment_attempts')      is not null union all
  select to_regclass('public.notifications')         is not null union all
  select to_regclass('public.notification_settings') is not null union all
  select to_regclass('public.signup_verifications')  is not null union all
  select to_regclass('public.payment_events')        is not null union all
  select to_regclass('public.receipts')              is not null union all
  select to_regclass('public.contact_messages')      is not null
)
select count(*) filter (where not present) as tables_still_missing,
       count(*)                            as tables_expected
from checks2;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — DATA / SEED SANITY   (run ONLY after applying — reads tables)
-- ─────────────────────────────────────────────────────────────────────────────
-- 029 seeds 3 plans (Starter / Professional / Enterprise) and backfills one
-- subscription per existing clinic. These confirm the platform is operational,
-- not just structurally present.

-- Plans seeded (expect 3: starter, professional, enterprise):
-- select id, name, price_xof from public.plans order by sort_order;

-- Every clinic has a subscription (expect 0 rows = none missing):
-- select c.id, c.name
-- from public.clinics c
-- left join public.subscriptions s on s.clinic_id = c.id
-- where s.id is null;

-- Subscription status spread (operational snapshot):
-- select status, count(*) from public.subscriptions group by status order by status;
