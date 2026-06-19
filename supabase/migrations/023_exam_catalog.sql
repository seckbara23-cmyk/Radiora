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
