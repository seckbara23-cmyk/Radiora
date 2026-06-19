// F13 — Exam Master Catalog (canonical data).
//
// Source: "LISTE DES EXAMENS.xlsx" (Dr Abibou BA, Senegal pilot). ~95 exams
// grouped by modality. This module is the single source of truth: the UI reads
// it directly, and supabase/migrations/023_exam_catalog.sql seeds the same rows
// into the DB (generated from here — keep them in sync).
//
// Pure and deterministic: no IO, no AI. The default technique is a starting
// point the radiologist edits before signing — AI never invents findings.

import type { ExamCatalogEntry, ExamModality, SpecialLayout } from '@/types/exam'

// Default TECHNIQUE paragraph per modality (mirrors hpd-engine FR_TECHNIQUES).
const TECHNIQUE: Record<ExamModality, string> = {
  US:  'Échographie réalisée par voie transcutanée avec sonde adaptée, en mode B et Doppler couleur.',
  CT:  'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.',
  MRI: 'IRM réalisée en séquences multiplanaires pondérées T1, T2 et appropriées au territoire exploré, avant et après injection de gadolinium.',
  XR:  'Radiographies standard réalisées de face et de profil.',
  MG:  'Mammographie réalisée bilatéralement et comparativement, en incidences de face (CC) et oblique externe (OBL).',
}

/** Slugify a French title into a stable snake_case examType key. */
export function slugifyExam(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

interface Seed {
  modality: ExamModality
  title: string
  special?: SpecialLayout
  /** Override the modality default technique. */
  technique?: string
}

// ── ÉCHOGRAPHIE ───────────────────────────────────────────────────────────────
const US_SEEDS: Seed[] = [
  { modality: 'US', title: 'ÉCHOGRAPHIE ABDOMINALE' },
  { modality: 'US', title: 'ÉCHOGRAPHIE ABDOMINO-PELVIENNE' },
  { modality: 'US', title: 'ÉCHOGRAPHIE PELVIENNE' },
  { modality: 'US', title: 'ÉCHOGRAPHIE DES VOIES URINAIRES' },
  { modality: 'US', title: 'ÉCHOGRAPHIE CERVICALE' },
  { modality: 'US', title: 'ÉCHOGRAPHIE DES PARTIES MOLLES' },
  { modality: 'US', title: 'ÉCHOGRAPHIE OSTÉO-ARTICULAIRE' },
  { modality: 'US', title: 'ÉCHOGRAPHIE MAMMAIRE' },
  { modality: 'US', title: 'ÉCHOGRAPHIE OBSTÉTRICALE (T2-T3)' },
  { modality: 'US', title: 'ÉCHOGRAPHIE OBSTÉTRICALE (T1)' },
  { modality: 'US', title: 'ÉCHODOPPLER DES BOURSES' },
  { modality: 'US', title: 'ÉCHODOPPLER DES TRONCS SUPRA-AORTIQUES' },
  { modality: 'US', title: 'ÉCHODOPPLER VEINEUX DES MEMBRES INFÉRIEURS' },
  { modality: 'US', title: 'ÉCHODOPPLER ARTÉRIEL DES MEMBRES INFÉRIEURS' },
]

// ── SCANNER ───────────────────────────────────────────────────────────────────
const CT_SEEDS: Seed[] = [
  { modality: 'CT', title: 'SCANNER CÉRÉBRAL' },
  { modality: 'CT', title: 'SCANNER THORACIQUE' },
  { modality: 'CT', title: 'ANGIOSCANNER THORACIQUE' },
  { modality: 'CT', title: 'SCANNER ABDOMINAL' },
  { modality: 'CT', title: 'SCANNER ABDOMINO-PELVIEN' },
  { modality: 'CT', title: 'SCANNER THORACO-ABDOMINO-PELVIEN' },
  { modality: 'CT', title: 'BODYSCANNER' },
  { modality: 'CT', title: 'SCANNER DU RACHIS LOMBAIRE' },
  { modality: 'CT', title: 'SCANNER DU RACHIS CERVICAL' },
  { modality: 'CT', title: 'SCANNER DU RACHIS DORSAL' },
  { modality: 'CT', title: 'SCANNER DU RACHIS CERVICO-DORSAL' },
  { modality: 'CT', title: 'SCANNER DU RACHIS DORSO-LOMBAIRE' },
  { modality: 'CT', title: 'SCANNER DU COU ET ORL' },
  { modality: 'CT', title: 'SCANNER DU MASSIF FACIAL' },
  { modality: 'CT', title: 'SCANNER DES SINUS' },
  { modality: 'CT', title: 'SCANNER DES ROCHERS' },
  { modality: 'CT', title: 'ANGIOSCANNER DES MEMBRES' },
  { modality: 'CT', title: 'ANGIOSCANNER AORTIQUE' },
  { modality: 'CT', title: 'ANGIOSCANNER DES TRONCS SUPRA-AORTIQUES' },
  { modality: 'CT', title: 'COROSCANNER' },
  { modality: 'CT', title: 'SCANNER CARDIAQUE' },
  { modality: 'CT', title: 'COLOSCANNER' },
  { modality: 'CT', title: 'UROSCANNER' },
  { modality: 'CT', title: 'SCANNER DU BASSIN' },
  { modality: 'CT', title: 'SCANNER DES GENOUX' },
  { modality: 'CT', title: 'SCANNER DU COUDE' },
  { modality: 'CT', title: 'SCANNER DES POIGNETS ET MAINS' },
  { modality: 'CT', title: 'SCANNOPELVIMÉTRIE', special: 'scannopelvimetrie' },
  { modality: 'CT', title: 'TÉLÉMÉTRIE DES MEMBRES INFÉRIEURS (TAGT)', special: 'tagt' },
]

// ── IRM ───────────────────────────────────────────────────────────────────────
const MRI_SEEDS: Seed[] = [
  { modality: 'MRI', title: 'IRM CÉRÉBRALE' },
  { modality: 'MRI', title: 'IRM ORBITO-CÉRÉBRALE' },
  { modality: 'MRI', title: 'IRM DES ROCHERS' },
  { modality: 'MRI', title: 'IRM DU COU ET ORL' },
  { modality: 'MRI', title: 'IRM THORACIQUE' },
  { modality: 'MRI', title: 'IRM CARDIAQUE' },
  { modality: 'MRI', title: 'IRM ABDOMINALE' },
  { modality: 'MRI', title: 'IRM HÉPATIQUE' },
  { modality: 'MRI', title: 'IRM PELVIENNE' },
  { modality: 'MRI', title: 'IRM PROSTATIQUE' },
  { modality: 'MRI', title: 'IRM MÉDULLAIRE' },
  { modality: 'MRI', title: 'IRM DE LA MOELLE' },
  { modality: 'MRI', title: 'IRM DU RACHIS' },
  { modality: 'MRI', title: 'IRM DU CORPS ENTIER' },
  { modality: 'MRI', title: 'IRM DES MEMBRES' },
  { modality: 'MRI', title: 'IRM DES PARTIES MOLLES' },
  { modality: 'MRI', title: "IRM DE L'ÉPAULE" },
  { modality: 'MRI', title: 'IRM DU COUDE' },
  { modality: 'MRI', title: 'IRM DES POIGNETS ET MAINS' },
  { modality: 'MRI', title: 'IRM DU GENOU' },
  { modality: 'MRI', title: 'IRM DU BASSIN' },
  { modality: 'MRI', title: 'IRM DE LA CHEVILLE ET DU PIED' },
]

// ── RADIOGRAPHIE ──────────────────────────────────────────────────────────────
const XR_SEEDS: Seed[] = [
  { modality: 'XR', title: 'RADIOGRAPHIE DU THORAX' },
  { modality: 'XR', title: "RADIOGRAPHIE DE L'ABDOMEN SANS PRÉPARATION (ASP)" },
  { modality: 'XR', title: 'RADIOGRAPHIE DU CAVUM' },
  { modality: 'XR', title: 'RADIOGRAPHIE DU RACHIS' },
  { modality: 'XR', title: 'RADIOGRAPHIE DU BASSIN' },
  { modality: 'XR', title: 'RADIOGRAPHIE DE LA HANCHE' },
  { modality: 'XR', title: 'RADIOGRAPHIE DU GENOU' },
  { modality: 'XR', title: "RADIOGRAPHIE DE L'ÉPAULE" },
  { modality: 'XR', title: 'RADIOGRAPHIE DU BRAS' },
  { modality: 'XR', title: 'RADIOGRAPHIE DU COUDE' },
  { modality: 'XR', title: "RADIOGRAPHIE DE L'AVANT-BRAS" },
  { modality: 'XR', title: 'RADIOGRAPHIE DES POIGNETS ET MAINS' },
  { modality: 'XR', title: 'RADIOGRAPHIE DE LA CHEVILLE ET DU PIED' },
  { modality: 'XR', title: 'BILAN RADIOGRAPHIQUE DU SQUELETTE' },
  {
    modality: 'XR',
    title: 'TRANSIT ŒSO-GASTRO-DUODÉNAL (TOGD)',
    technique: 'Opacification œso-gastro-duodénale réalisée après ingestion de produit de contraste baryté, avec clichés en réplétion et en évacuation.',
  },
  {
    modality: 'XR',
    title: 'LAVEMENT BARYTÉ',
    technique: 'Opacification colique rétrograde réalisée après lavement au produit de contraste baryté, avec clichés en réplétion et en évacuation.',
  },
  {
    modality: 'XR',
    title: 'HYSTÉROSALPINGOGRAPHIE',
    technique: 'Opacification utéro-tubaire réalisée par voie rétrograde après injection de produit de contraste iodé, avec clichés successifs.',
  },
  {
    modality: 'XR',
    title: 'URÉTROCYSTOGRAPHIE RÉTROGRADE (UCR)',
    technique: 'Opacification urétro-vésicale réalisée par voie rétrograde après injection de produit de contraste iodé, avec clichés mictionnels.',
  },
]

// ── MAMMOGRAPHIE (table-based, F18) ───────────────────────────────────────────
const MG_SEEDS: Seed[] = [
  { modality: 'MG', title: 'MAMMOGRAPHIE', special: 'mammographie' },
]

const ALL_SEEDS: Seed[] = [...US_SEEDS, ...CT_SEEDS, ...MRI_SEEDS, ...XR_SEEDS, ...MG_SEEDS]

/** The shipped global exam catalog, fully expanded. */
export const EXAM_CATALOG: ExamCatalogEntry[] = ALL_SEEDS.map((s, i) => ({
  examType: slugifyExam(s.title),
  modality: s.modality,
  title: s.title,
  defaultTechnique: s.technique ?? TECHNIQUE[s.modality],
  ...(s.special ? { specialLayout: s.special } : {}),
  isCustom: false,
  sortOrder: i,
}))

/** Lookup by stable key. */
export function findExam(examType: string): ExamCatalogEntry | undefined {
  return EXAM_CATALOG.find((e) => e.examType === examType)
}

export { TECHNIQUE as MODALITY_TECHNIQUE }
