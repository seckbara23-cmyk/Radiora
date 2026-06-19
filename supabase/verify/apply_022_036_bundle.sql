-- ============================================================================
-- Radiora — consolidated apply bundle for migrations 022–036
-- Phase 4 (4A–4F) + Phase 5 (5A–5J). Generated from supabase/migrations/.
--
-- All statements are idempotent (CREATE … IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, DROP POLICY IF EXISTS + CREATE POLICY, INSERT … ON CONFLICT), so
-- this bundle is safe to run whole, even if some migrations were already
-- applied. Run it in the Supabase SQL editor (postgres role), then run
-- status_022_036.sql to confirm.
-- ============================================================================


-- =====================================================================
-- 022_report_version_audit.sql
-- =====================================================================
-- Feature 10 — medical safety hardening.
-- Enrich report version snapshots with the action that produced them and a
-- machine-readable diff, so the version history is a full audit trail of every
-- save / validation / signing / amendment.

alter table public.report_versions
  add column if not exists action text,                     -- saved | signed | amended
  add column if not exists diff   jsonb not null default '{}'::jsonb;

comment on column public.report_versions.action is
  'What produced this snapshot: saved | signed | amended (Feature 10).';
comment on column public.report_versions.diff is
  'Diff metadata, e.g. { changedSections: [...], previousVersion: n } (Feature 10).';

-- Helpful index for querying a report''s signing/amendment events.
create index if not exists report_versions_action_idx
  on public.report_versions (report_id, action);


-- =====================================================================
-- 023_exam_catalog.sql
-- =====================================================================
-- =============================================================================
-- 023_exam_catalog.sql  —  F13 Exam Master Catalog
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor.  Safe to re-run (idempotent).
--
-- A normalized catalog of the radiology exams offered by the pilot site,
-- derived from "LISTE DES EXAMENS.xlsx" (Dr Abibou BA, Senegal). Canonical data
-- also lives in src/config/exam-catalog.ts (single source of truth) and is
-- generated into the seed block below — keep the two in sync.
--
-- Rows with clinic_id IS NULL are the GLOBAL catalog shipped to every clinic.
-- A clinic may add its own exams (clinic_id = its id); those merge on top.
--
-- Safety: this is reference data only — modality, titles and a DEFAULT technique
-- paragraph that the radiologist always edits before signing. No clinical
-- findings are stored here; AI never invents content from it.

create table if not exists public.exam_catalog (
  id                 uuid        primary key default gen_random_uuid(),
  clinic_id          uuid        references public.clinics (id) on delete cascade,  -- null = global
  modality           text        not null check (modality in ('US','CT','MRI','XR','MG')),
  title              text        not null,
  exam_type          text        not null,
  default_technique  text        not null default '',
  normal_template_id uuid        references public.report_templates (id) on delete set null,
  special_layout     text        check (special_layout in ('scannopelvimetrie','tagt','mammographie')),
  is_active          boolean     not null default true,
  sort_order         integer     not null default 0,
  created_by         uuid        references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One row per exam_type within the global set, and within each clinic's set.
create unique index if not exists exam_catalog_global_uq
  on public.exam_catalog (exam_type) where clinic_id is null;
create unique index if not exists exam_catalog_clinic_uq
  on public.exam_catalog (clinic_id, exam_type) where clinic_id is not null;
create index if not exists exam_catalog_modality_idx
  on public.exam_catalog (modality, sort_order);

drop trigger if exists exam_catalog_updated_at on public.exam_catalog;
create trigger exam_catalog_updated_at
  before update on public.exam_catalog
  for each row execute function public.handle_updated_at();

alter table public.exam_catalog enable row level security;

drop policy if exists "exam_catalog: read"   on public.exam_catalog;
drop policy if exists "exam_catalog: insert" on public.exam_catalog;
drop policy if exists "exam_catalog: update" on public.exam_catalog;
drop policy if exists "exam_catalog: delete" on public.exam_catalog;

-- Everyone authenticated reads the global catalog plus their own clinic's exams.
create policy "exam_catalog: read"
  on public.exam_catalog for select to authenticated
  using (
    clinic_id is null
    or clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- Clinic admins manage ONLY their own clinic's custom exams (never the globals).
create policy "exam_catalog: insert"
  on public.exam_catalog for insert to authenticated
  with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin','super_admin')
  );
create policy "exam_catalog: update"
  on public.exam_catalog for update to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin','super_admin')
  )
  with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin','super_admin')
  );
create policy "exam_catalog: delete"
  on public.exam_catalog for delete to authenticated
  using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin','super_admin')
  );

-- ─── Seed: global catalog (clinic_id NULL) ────────────────────────────────────
-- Generated from src/config/exam-catalog.ts. ON CONFLICT keeps re-runs idempotent.
insert into public.exam_catalog (exam_type, modality, title, default_technique, special_layout, sort_order)
values
  ('echographie_abdominale', 'US', 'ÉCHOGRAPHIE ABDOMINALE', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 0),
  ('echographie_abdomino_pelvienne', 'US', 'ÉCHOGRAPHIE ABDOMINO-PELVIENNE', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 1),
  ('echographie_pelvienne', 'US', 'ÉCHOGRAPHIE PELVIENNE', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 2),
  ('echographie_des_voies_urinaires', 'US', 'ÉCHOGRAPHIE DES VOIES URINAIRES', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 3),
  ('echographie_cervicale', 'US', 'ÉCHOGRAPHIE CERVICALE', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 4),
  ('echographie_des_parties_molles', 'US', 'ÉCHOGRAPHIE DES PARTIES MOLLES', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 5),
  ('echographie_osteo_articulaire', 'US', 'ÉCHOGRAPHIE OSTÉO-ARTICULAIRE', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 6),
  ('echographie_mammaire', 'US', 'ÉCHOGRAPHIE MAMMAIRE', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 7),
  ('echographie_obstetricale_t2_t3', 'US', 'ÉCHOGRAPHIE OBSTÉTRICALE (T2-T3)', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 8),
  ('echographie_obstetricale_t1', 'US', 'ÉCHOGRAPHIE OBSTÉTRICALE (T1)', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 9),
  ('echodoppler_des_bourses', 'US', 'ÉCHODOPPLER DES BOURSES', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 10),
  ('echodoppler_des_troncs_supra_aortiques', 'US', 'ÉCHODOPPLER DES TRONCS SUPRA-AORTIQUES', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 11),
  ('echodoppler_veineux_des_membres_inferieurs', 'US', 'ÉCHODOPPLER VEINEUX DES MEMBRES INFÉRIEURS', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 12),
  ('echodoppler_arteriel_des_membres_inferieurs', 'US', 'ÉCHODOPPLER ARTÉRIEL DES MEMBRES INFÉRIEURS', 'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.', null, 13),
  ('scanner_cerebral', 'CT', 'SCANNER CÉRÉBRAL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 14),
  ('scanner_thoracique', 'CT', 'SCANNER THORACIQUE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 15),
  ('angioscanner_thoracique', 'CT', 'ANGIOSCANNER THORACIQUE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 16),
  ('scanner_abdominal', 'CT', 'SCANNER ABDOMINAL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 17),
  ('scanner_abdomino_pelvien', 'CT', 'SCANNER ABDOMINO-PELVIEN', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 18),
  ('scanner_thoraco_abdomino_pelvien', 'CT', 'SCANNER THORACO-ABDOMINO-PELVIEN', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 19),
  ('bodyscanner', 'CT', 'BODYSCANNER', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 20),
  ('scanner_du_rachis_lombaire', 'CT', 'SCANNER DU RACHIS LOMBAIRE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 21),
  ('scanner_du_rachis_cervical', 'CT', 'SCANNER DU RACHIS CERVICAL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 22),
  ('scanner_du_rachis_dorsal', 'CT', 'SCANNER DU RACHIS DORSAL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 23),
  ('scanner_du_rachis_cervico_dorsal', 'CT', 'SCANNER DU RACHIS CERVICO-DORSAL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 24),
  ('scanner_du_rachis_dorso_lombaire', 'CT', 'SCANNER DU RACHIS DORSO-LOMBAIRE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 25),
  ('scanner_du_cou_et_orl', 'CT', 'SCANNER DU COU ET ORL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 26),
  ('scanner_du_massif_facial', 'CT', 'SCANNER DU MASSIF FACIAL', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 27),
  ('scanner_des_sinus', 'CT', 'SCANNER DES SINUS', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 28),
  ('scanner_des_rochers', 'CT', 'SCANNER DES ROCHERS', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 29),
  ('angioscanner_des_membres', 'CT', 'ANGIOSCANNER DES MEMBRES', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 30),
  ('angioscanner_aortique', 'CT', 'ANGIOSCANNER AORTIQUE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 31),
  ('angioscanner_des_troncs_supra_aortiques', 'CT', 'ANGIOSCANNER DES TRONCS SUPRA-AORTIQUES', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 32),
  ('coroscanner', 'CT', 'COROSCANNER', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 33),
  ('scanner_cardiaque', 'CT', 'SCANNER CARDIAQUE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 34),
  ('coloscanner', 'CT', 'COLOSCANNER', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 35),
  ('uroscanner', 'CT', 'UROSCANNER', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 36),
  ('scanner_du_bassin', 'CT', 'SCANNER DU BASSIN', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 37),
  ('scanner_des_genoux', 'CT', 'SCANNER DES GENOUX', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 38),
  ('scanner_du_coude', 'CT', 'SCANNER DU COUDE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 39),
  ('scanner_des_poignets_et_mains', 'CT', 'SCANNER DES POIGNETS ET MAINS', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', null, 40),
  ('scannopelvimetrie', 'CT', 'SCANNOPELVIMÉTRIE', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', 'scannopelvimetrie', 41),
  ('telemetrie_des_membres_inferieurs_tagt', 'CT', 'TÉLÉMÉTRIE DES MEMBRES INFÉRIEURS (TAGT)', 'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.', 'tagt', 42),
  ('irm_cerebrale', 'MRI', 'IRM CÉRÉBRALE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 43),
  ('irm_orbito_cerebrale', 'MRI', 'IRM ORBITO-CÉRÉBRALE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 44),
  ('irm_des_rochers', 'MRI', 'IRM DES ROCHERS', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 45),
  ('irm_du_cou_et_orl', 'MRI', 'IRM DU COU ET ORL', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 46),
  ('irm_thoracique', 'MRI', 'IRM THORACIQUE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 47),
  ('irm_cardiaque', 'MRI', 'IRM CARDIAQUE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 48),
  ('irm_abdominale', 'MRI', 'IRM ABDOMINALE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 49),
  ('irm_hepatique', 'MRI', 'IRM HÉPATIQUE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 50),
  ('irm_pelvienne', 'MRI', 'IRM PELVIENNE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 51),
  ('irm_prostatique', 'MRI', 'IRM PROSTATIQUE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 52),
  ('irm_medullaire', 'MRI', 'IRM MÉDULLAIRE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 53),
  ('irm_de_la_moelle', 'MRI', 'IRM DE LA MOELLE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 54),
  ('irm_du_rachis', 'MRI', 'IRM DU RACHIS', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 55),
  ('irm_du_corps_entier', 'MRI', 'IRM DU CORPS ENTIER', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 56),
  ('irm_des_membres', 'MRI', 'IRM DES MEMBRES', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 57),
  ('irm_des_parties_molles', 'MRI', 'IRM DES PARTIES MOLLES', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 58),
  ('irm_de_l_epaule', 'MRI', 'IRM DE L''ÉPAULE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 59),
  ('irm_du_coude', 'MRI', 'IRM DU COUDE', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 60),
  ('irm_des_poignets_et_mains', 'MRI', 'IRM DES POIGNETS ET MAINS', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 61),
  ('irm_du_genou', 'MRI', 'IRM DU GENOU', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 62),
  ('irm_du_bassin', 'MRI', 'IRM DU BASSIN', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 63),
  ('irm_de_la_cheville_et_du_pied', 'MRI', 'IRM DE LA CHEVILLE ET DU PIED', 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.', null, 64),
  ('radiographie_du_thorax', 'XR', 'RADIOGRAPHIE DU THORAX', 'Radiographies standard réalisées de face et de profil.', null, 65),
  ('radiographie_de_l_abdomen_sans_preparation_asp', 'XR', 'RADIOGRAPHIE DE L''ABDOMEN SANS PRÉPARATION (ASP)', 'Radiographies standard réalisées de face et de profil.', null, 66),
  ('radiographie_du_cavum', 'XR', 'RADIOGRAPHIE DU CAVUM', 'Radiographies standard réalisées de face et de profil.', null, 67),
  ('radiographie_du_rachis', 'XR', 'RADIOGRAPHIE DU RACHIS', 'Radiographies standard réalisées de face et de profil.', null, 68),
  ('radiographie_du_bassin', 'XR', 'RADIOGRAPHIE DU BASSIN', 'Radiographies standard réalisées de face et de profil.', null, 69),
  ('radiographie_de_la_hanche', 'XR', 'RADIOGRAPHIE DE LA HANCHE', 'Radiographies standard réalisées de face et de profil.', null, 70),
  ('radiographie_du_genou', 'XR', 'RADIOGRAPHIE DU GENOU', 'Radiographies standard réalisées de face et de profil.', null, 71),
  ('radiographie_de_l_epaule', 'XR', 'RADIOGRAPHIE DE L''ÉPAULE', 'Radiographies standard réalisées de face et de profil.', null, 72),
  ('radiographie_du_bras', 'XR', 'RADIOGRAPHIE DU BRAS', 'Radiographies standard réalisées de face et de profil.', null, 73),
  ('radiographie_du_coude', 'XR', 'RADIOGRAPHIE DU COUDE', 'Radiographies standard réalisées de face et de profil.', null, 74),
  ('radiographie_de_l_avant_bras', 'XR', 'RADIOGRAPHIE DE L''AVANT-BRAS', 'Radiographies standard réalisées de face et de profil.', null, 75),
  ('radiographie_des_poignets_et_mains', 'XR', 'RADIOGRAPHIE DES POIGNETS ET MAINS', 'Radiographies standard réalisées de face et de profil.', null, 76),
  ('radiographie_de_la_cheville_et_du_pied', 'XR', 'RADIOGRAPHIE DE LA CHEVILLE ET DU PIED', 'Radiographies standard réalisées de face et de profil.', null, 77),
  ('bilan_radiographique_du_squelette', 'XR', 'BILAN RADIOGRAPHIQUE DU SQUELETTE', 'Radiographies standard réalisées de face et de profil.', null, 78),
  ('transit_so_gastro_duodenal_togd', 'XR', 'TRANSIT ŒSO-GASTRO-DUODÉNAL (TOGD)', 'Opacification œso-gastro-duodénale réalisée après ingestion de produit de contraste baryté, avec clichés en réplétion et en évacuation.', null, 79),
  ('lavement_baryte', 'XR', 'LAVEMENT BARYTÉ', 'Opacification colique rétrograde réalisée après lavement au produit de contraste baryté, avec clichés en réplétion et en évacuation.', null, 80),
  ('hysterosalpingographie', 'XR', 'HYSTÉROSALPINGOGRAPHIE', 'Opacification utéro-tubaire réalisée par voie rétrograde après injection de produit de contraste iodé, avec clichés successifs.', null, 81),
  ('uretrocystographie_retrograde_ucr', 'XR', 'URÉTROCYSTOGRAPHIE RÉTROGRADE (UCR)', 'Opacification urétro-vésicale réalisée par voie rétrograde après injection de produit de contraste iodé, avec clichés mictionnels.', null, 82),
  ('mammographie', 'MG', 'MAMMOGRAPHIE', 'Mammographie réalisée bilatéralement et comparativement, en incidences de face (CC) et oblique externe (OBL).', 'mammographie', 83)
on conflict (exam_type) where clinic_id is null do nothing;


-- =====================================================================
-- 024_template_sections.sql
-- =====================================================================
-- F16 — Template Importer: structured HPD sections on report templates.
--
-- report_templates already holds findings_template (→ RÉSULTATS) and
-- impression_template (→ CONCLUSION). Doctors' models (e.g. Dr ABIBOU BA's normal
-- templates) also carry INDICATION and TECHNIQUE, and we want to link a template
-- to its exam in the catalog and record where it came from.

alter table public.report_templates
  add column if not exists indication_template text not null default '',
  add column if not exists technique_template  text not null default '',
  add column if not exists exam_type           text,
  add column if not exists source              text;

comment on column public.report_templates.indication_template is 'HPD INDICATION section (default/boilerplate).';
comment on column public.report_templates.technique_template  is 'HPD TECHNIQUE section (default/boilerplate).';
comment on column public.report_templates.exam_type           is 'Optional link to exam_catalog.exam_type (slug).';
comment on column public.report_templates.source              is 'Provenance: manual | import:docx | import:paste | seed:dr-ba.';

-- Lookups by exam within a clinic (template suggestions for a given exam).
create index if not exists report_templates_clinic_exam_idx
  on public.report_templates (clinic_id, exam_type)
  where exam_type is not null;


-- =====================================================================
-- 025_hospital_headers.sql
-- =====================================================================
-- F12 — Hospital Header Library.
--
-- A clinic can pick from a library of institution letterheads when exporting a
-- report (or export with no header at all). Global seed rows (clinic_id NULL) are
-- shared with every clinic; clinic-scoped rows are private to that clinic.

create table if not exists public.hospital_headers (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references public.clinics(id) on delete cascade,  -- null = global
  name        text not null,                       -- institution / établissement
  overline    text not null default '',            -- lines above the name (e.g. command)
  department  text not null default '',            -- imaging department / service
  subtitle    text not null default '',            -- line below dept (e.g. equipment)
  address     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  logo_url    text,                                -- path in clinic-branding bucket or URL
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hospital_headers_clinic_idx
  on public.hospital_headers (clinic_id) where clinic_id is not null;

drop trigger if exists hospital_headers_updated_at on public.hospital_headers;
create trigger hospital_headers_updated_at
  before update on public.hospital_headers
  for each row execute function public.handle_updated_at();

alter table public.hospital_headers enable row level security;

-- Read: global seeds, your clinic's headers, or super_admin sees all.
drop policy if exists hospital_headers_select on public.hospital_headers;
create policy hospital_headers_select on public.hospital_headers
  for select using (
    clinic_id is null
    or clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- Write: only your own clinic's rows, and only admins.
drop policy if exists hospital_headers_insert on public.hospital_headers;
create policy hospital_headers_insert on public.hospital_headers
  for insert with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

drop policy if exists hospital_headers_update on public.hospital_headers;
create policy hospital_headers_update on public.hospital_headers
  for update using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

drop policy if exists hospital_headers_delete on public.hospital_headers;
create policy hospital_headers_delete on public.hospital_headers
  for delete using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'super_admin')
  );

-- Keep global seeds unique by name so re-running this migration never duplicates.
create unique index if not exists hospital_headers_global_name_uq
  on public.hospital_headers (name) where clinic_id is null;

-- ── Seed: the two pilot institutions (global, clinic_id NULL) ──
insert into public.hospital_headers (clinic_id, name, overline, department, subtitle, phone, email, sort_order)
values
  (
    null,
    'ETABLISSEMENT HOSPITALIER MILITAIRE DE ZIGUINCHOR',
    E'ETAT MAJOR GENERAL DES ARMEES\nZONE MILITAIRE 5',
    'SERVICE D’IMAGERIE MEDICALE',
    '',
    '76 625 98 13',
    'dssacmiaz@gmail.com',
    1
  ),
  (
    null,
    'HOPITAL PRINCIPAL DE DAKAR',
    '',
    'DEPARTEMENT D’IMAGERIE MEDICALE',
    'IRM 3 Tesla – Scanner 128 coupes – Mammographie et Radiographie digitales – Echographie doppler – Radiologie Interventionnelle',
    '33 839 58 38',
    '',
    2
  )
on conflict (name) where clinic_id is null do nothing;


-- =====================================================================
-- 026_profile_signature.sql
-- =====================================================================
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


-- =====================================================================
-- 027_vocabulary_memory.sql
-- =====================================================================
-- F15 — Vocabulary Memory.
--
-- Radiora learns each radiologist's preferred wording from the corrections they
-- make to their own transcripts, and can also hold a clinic-wide shared
-- dictionary. Each entry is a (source_text → target_text) wording pair; nothing
-- here ever modifies clinical meaning (that is enforced in pure code,
-- src/lib/ai/vocabulary.ts, before anything is written) and nothing is
-- auto-applied — the editor only ever SUGGESTS the preferred term.
--
-- Scope model (mirrors hospital_headers' null-clinic idea, one level deeper):
--   * user_id NOT NULL  → personal dictionary, private to that radiologist.
--   * user_id NULL      → clinic-wide shared dictionary (managed by admins).
-- clinic_id is always set; a row never leaves its clinic.

create table if not exists public.vocabulary_entries (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id)  on delete cascade,
  user_id      uuid references public.profiles(id)          on delete cascade,  -- null = clinic-wide
  kind         text not null default 'word'
                 check (kind in ('word', 'phrase', 'spelling', 'terminology', 'conclusion')),
  modality     text,                                  -- null = applies to all modalities
  source_text  text not null,                         -- spoken / mis-transcribed form
  target_text  text not null,                         -- radiologist's preferred form
  frequency    integer not null default 1,            -- how often this correction was confirmed
  confidence   numeric(4,3) not null default 0.200,   -- derived from frequency, capped at 1
  last_used_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vocabulary_entries_scope_idx
  on public.vocabulary_entries (clinic_id, user_id);

create index if not exists vocabulary_entries_modality_idx
  on public.vocabulary_entries (clinic_id, modality) where modality is not null;

-- One canonical row per (scope, kind, modality, normalized source). The COALESCE
-- placeholders let a NULL user_id (clinic-wide) and NULL modality participate in
-- uniqueness; the same expressions are used as the ON CONFLICT target by the
-- learn RPC below, so they must match exactly.
create unique index if not exists vocabulary_entries_dedupe_uq
  on public.vocabulary_entries (
    clinic_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    coalesce(modality, ''),
    lower(source_text)
  );

drop trigger if exists vocabulary_entries_updated_at on public.vocabulary_entries;
create trigger vocabulary_entries_updated_at
  before update on public.vocabulary_entries
  for each row execute function public.handle_updated_at();

alter table public.vocabulary_entries enable row level security;

-- Read: your own personal entries + your clinic's shared entries; super_admin all.
drop policy if exists vocabulary_entries_select on public.vocabulary_entries;
create policy vocabulary_entries_select on public.vocabulary_entries
  for select using (
    (
      clinic_id = public.get_current_user_clinic_id()
      and (user_id is null or user_id = auth.uid())
    )
    or public.is_super_admin()
  );

-- Insert: a personal entry you own, OR a clinic-wide entry if you are an admin.
-- Always within your own clinic.
drop policy if exists vocabulary_entries_insert on public.vocabulary_entries;
create policy vocabulary_entries_insert on public.vocabulary_entries
  for insert with check (
    clinic_id = public.get_current_user_clinic_id()
    and (
      user_id = auth.uid()
      or (
        user_id is null
        and public.get_current_user_role() in ('clinic_admin', 'super_admin')
      )
    )
  );

drop policy if exists vocabulary_entries_update on public.vocabulary_entries;
create policy vocabulary_entries_update on public.vocabulary_entries
  for update using (
    clinic_id = public.get_current_user_clinic_id()
    and (
      user_id = auth.uid()
      or (
        user_id is null
        and public.get_current_user_role() in ('clinic_admin', 'super_admin')
      )
    )
  );

drop policy if exists vocabulary_entries_delete on public.vocabulary_entries;
create policy vocabulary_entries_delete on public.vocabulary_entries
  for delete using (
    clinic_id = public.get_current_user_clinic_id()
    and (
      user_id = auth.uid()
      or (
        user_id is null
        and public.get_current_user_role() in ('clinic_admin', 'super_admin')
      )
    )
  );


-- ─── learn_vocabulary_entry RPC ───────────────────────────────────────────────
-- Upserts a PERSONAL vocabulary entry for the authenticated radiologist and bumps
-- its frequency/confidence atomically. Confidence = least(1, round(freq/5, 2)),
-- matching vocabularyConfidence() in src/lib/ai/vocabulary.ts.
--
-- Security:
--   * The owner is always auth.uid() — never a client-supplied id.
--   * The clinic is always public.get_current_user_clinic_id().
--   * SECURITY INVOKER: the RLS insert/update policies above already permit a user
--     to write their own personal rows, so no elevated privilege is needed; RLS
--     stays in force as a second line of defence.
--   * search_path is locked and every object is schema-qualified.
create or replace function public.learn_vocabulary_entry(
  p_kind     text,
  p_modality text,
  p_source   text,
  p_target   text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_clinic uuid := public.get_current_user_clinic_id();
  v_user   uuid := auth.uid();
  v_id     uuid;
begin
  if v_clinic is null or v_user is null then
    return null;
  end if;
  if p_source is null or pg_catalog.btrim(p_source) = ''
     or p_target is null or pg_catalog.btrim(p_target) = '' then
    return null;
  end if;

  insert into public.vocabulary_entries
    (clinic_id, user_id, kind, modality, source_text, target_text,
     frequency, confidence, last_used_at, created_by)
  values
    (v_clinic, v_user, coalesce(p_kind, 'word'), p_modality,
     pg_catalog.btrim(p_source), pg_catalog.btrim(p_target),
     1, 0.200, pg_catalog.now(), v_user)
  on conflict (
    clinic_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    coalesce(modality, ''),
    lower(source_text)
  )
  do update set
    frequency    = public.vocabulary_entries.frequency + 1,
    target_text  = excluded.target_text,
    confidence   = least(1.0, round((public.vocabulary_entries.frequency + 1) / 5.0, 2)),
    last_used_at = pg_catalog.now(),
    updated_at   = pg_catalog.now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.learn_vocabulary_entry(text, text, text, text) is
  'Upserts a personal vocabulary entry for the authenticated radiologist and '
  'increments its frequency/confidence. Owner and clinic are derived server-side.';

revoke all     on function public.learn_vocabulary_entry(text, text, text, text) from public;
grant  execute on function public.learn_vocabulary_entry(text, text, text, text) to authenticated;


-- ─── Structural verification (runs at migration time) ─────────────────────────
do $$
declare
  v_rls    boolean;
  v_secdef boolean;
begin
  select c.relrowsecurity into v_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'vocabulary_entries';

  if v_rls is null then
    raise exception 'vocabulary_entries table was not created';
  end if;
  if not v_rls then
    raise exception 'vocabulary_entries must have row level security enabled';
  end if;

  select p.prosecdef into v_secdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'learn_vocabulary_entry';

  if v_secdef is null then
    raise exception 'learn_vocabulary_entry was not created';
  end if;
  if v_secdef then
    raise exception 'learn_vocabulary_entry must be SECURITY INVOKER';
  end if;

  raise notice 'vocabulary_entries + learn_vocabulary_entry: RLS on, SECURITY INVOKER OK';
end;
$$;


-- =====================================================================
-- 028_secure_delivery.sql
-- =====================================================================
-- F17 — Secure Report Delivery.
--
-- A validated report can be delivered through a secure, optionally
-- password-protected, expiring link. We never transmit PHI to an external
-- service: a delivery is an in-app artifact (a token + access policy + an audit
-- trail). At creation time the PDF/DOCX are rendered with the SAME pipeline as the
-- F9 export and frozen into the private `report-deliveries` storage bucket, so the
-- file a patient downloads is byte-identical to the staff export and no anonymous
-- query ever touches the live report tables.
--
-- The public link path (/r/<token> and /api/delivery/<token>/file) reads this
-- table and the bucket through the service-role client server-side; RLS below
-- governs STAFF access only.

create table if not exists public.report_deliveries (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  report_id      uuid not null references public.reports(id) on delete cascade,
  channel        text not null default 'link'
                   check (channel in ('patient', 'physician', 'link')),
  recipient_label text not null default '',          -- name/contact typed by staff; never transmitted
  token          text not null unique,               -- secret part of the secure URL
  password_kind  text not null default 'none'
                   check (password_kind in ('none', 'custom', 'dob')),
  password_hash  text,                               -- scrypt$salt$hash, null when password_kind = none
  pdf_path       text,                               -- path in report-deliveries bucket
  docx_path      text,
  filename_base  text not null default 'compte-rendu',
  header_choice  text not null default '',           -- '' default | header id | 'none'
  expires_at     timestamptz,                        -- null = never expires
  opened_count   integer not null default 0,
  download_count integer not null default 0,
  last_accessed_at timestamptz,
  revoked_at     timestamptz,                        -- non-null = revoked
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists report_deliveries_report_idx
  on public.report_deliveries (report_id);
create index if not exists report_deliveries_clinic_idx
  on public.report_deliveries (clinic_id);
-- Token lookups happen on the public path via the service-role client; a plain
-- unique index already backs them.

drop trigger if exists report_deliveries_updated_at on public.report_deliveries;
create trigger report_deliveries_updated_at
  before update on public.report_deliveries
  for each row execute function public.handle_updated_at();

alter table public.report_deliveries enable row level security;

-- Read: staff see their own clinic's deliveries; super_admin sees all. (The public
-- patient path does NOT use these policies — it uses the service-role client.)
drop policy if exists report_deliveries_select on public.report_deliveries;
create policy report_deliveries_select on public.report_deliveries
  for select using (
    clinic_id = public.get_current_user_clinic_id()
    or public.is_super_admin()
  );

-- Write: only radiologists / admins, only within their own clinic. (Secure
-- delivery never validates a report — that gate is enforced in the action layer
-- before a row is ever inserted.)
drop policy if exists report_deliveries_insert on public.report_deliveries;
create policy report_deliveries_insert on public.report_deliveries
  for insert with check (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

drop policy if exists report_deliveries_update on public.report_deliveries;
create policy report_deliveries_update on public.report_deliveries
  for update using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

drop policy if exists report_deliveries_delete on public.report_deliveries;
create policy report_deliveries_delete on public.report_deliveries
  for delete using (
    clinic_id = public.get_current_user_clinic_id()
    and public.get_current_user_role() in ('clinic_admin', 'radiologist', 'super_admin')
  );

-- Private bucket holding the frozen export files. No public access; both staff
-- writes and the public download path go through the service-role client.
insert into storage.buckets (id, name, public)
values ('report-deliveries', 'report-deliveries', false)
on conflict (id) do nothing;


-- ─── Structural verification (runs at migration time) ─────────────────────────
do $$
declare
  v_rls boolean;
begin
  select c.relrowsecurity into v_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'report_deliveries';

  if v_rls is null then
    raise exception 'report_deliveries table was not created';
  end if;
  if not v_rls then
    raise exception 'report_deliveries must have row level security enabled';
  end if;

  raise notice 'report_deliveries: created with RLS enabled OK';
end;
$$;


-- =====================================================================
-- 029_billing_subscriptions.sql
-- =====================================================================
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


-- =====================================================================
-- 030_notifications.sql
-- =====================================================================
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


-- =====================================================================
-- 031_notification_settings.sql
-- =====================================================================
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


-- =====================================================================
-- 032_signup_verifications.sql
-- =====================================================================
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


-- =====================================================================
-- 033_payment_events.sql
-- =====================================================================
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


-- =====================================================================
-- 034_payment_purpose.sql
-- =====================================================================
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


-- =====================================================================
-- 035_receipts.sql
-- =====================================================================
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


-- =====================================================================
-- 036_contact_messages.sql
-- =====================================================================
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

