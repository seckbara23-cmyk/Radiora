import type { StructuredReportData } from '@/types/report'
import { routeTranscript, type SectionProvenance } from '@/lib/ai/section-router'

export type { SectionProvenance }

export type { StructuredReportData }

export interface HpdContext {
  modality:    string | null
  bodyPart:    string | null
  patientName: string
  patientAge:  string
  patientSex:  string
  locale?:     string
}

// Section header vocabulary now lives in ONE place: section-router.ts. The old
// SECTION_KEYWORDS table here was a second copy, and a second copy of routing
// vocabulary is how two callers start disagreeing about where a sentence goes.

type SectionKey = 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'

// ─── Exam title mapping ────────────────────────────────────────────────────────

interface ExamInfo {
  examType:  string
  examTitle: string
}

// Ordered longest-body-match first within each modality.
const MODALITY_BODY_MAP: Array<[string, string, ExamInfo]> = [
  // CT ─────────────────────────────────────────────────────────────────────────
  ['CT', 'lombo',      { examType: 'scanner_rachis_lombaire',  examTitle: 'SCANNER DU RACHIS LOMBO-SACRÉ' }],
  ['CT', 'lombaire',   { examType: 'scanner_rachis_lombaire',  examTitle: 'SCANNER DU RACHIS LOMBAIRE' }],
  ['CT', 'lumbar',     { examType: 'scanner_rachis_lombaire',  examTitle: 'SCANNER DU RACHIS LOMBAIRE' }],
  ['CT', 'rachis',     { examType: 'scanner_rachis',           examTitle: 'SCANNER DU RACHIS' }],
  ['CT', 'spine',      { examType: 'scanner_rachis',           examTitle: 'SCANNER DU RACHIS' }],
  ['CT', 'cerveau',    { examType: 'scanner_cerebral',         examTitle: 'SCANNER CÉRÉBRAL' }],
  ['CT', 'cerebr',     { examType: 'scanner_cerebral',         examTitle: 'SCANNER CÉRÉBRAL' }],
  ['CT', 'brain',      { examType: 'scanner_cerebral',         examTitle: 'SCANNER CÉRÉBRAL' }],
  ['CT', 'tete',       { examType: 'scanner_cerebral',         examTitle: 'SCANNER CÉRÉBRAL' }],
  ['CT', 'head',       { examType: 'scanner_cerebral',         examTitle: 'SCANNER CÉRÉBRAL' }],
  ['CT', 'thorax',     { examType: 'scanner_thoracique',       examTitle: 'SCANNER THORACIQUE' }],
  ['CT', 'chest',      { examType: 'scanner_thoracique',       examTitle: 'SCANNER THORACIQUE' }],
  ['CT', 'pulmon',     { examType: 'scanner_thoracique',       examTitle: 'SCANNER THORACIQUE' }],
  ['CT', 'abdomen',    { examType: 'scanner_abdominal',        examTitle: 'SCANNER ABDOMINAL' }],
  ['CT', 'pelvis',     { examType: 'scanner_pelvien',          examTitle: 'SCANNER PELVIEN' }],
  ['CT', 'sinus',      { examType: 'scanner_sinus',            examTitle: 'SCANNER DES SINUS' }],
  ['CT', 'cranio',     { examType: 'scanner_craniofacial',     examTitle: 'SCANNER CRÂNIO-FACIAL' }],
  ['CT', 'facial',     { examType: 'scanner_craniofacial',     examTitle: 'SCANNER CRÂNIO-FACIAL' }],
  ['CT', 'foie',       { examType: 'scanner_hepatique',        examTitle: 'SCANNER HÉPATIQUE' }],
  ['CT', 'liver',      { examType: 'scanner_hepatique',        examTitle: 'SCANNER HÉPATIQUE' }],
  ['CT', 'kidney',     { examType: 'scanner_renal',            examTitle: 'SCANNER RÉNAL' }],
  ['CT', 'rein',       { examType: 'scanner_renal',            examTitle: 'SCANNER RÉNAL' }],
  ['CT', 'neck',       { examType: 'scanner_cervical',         examTitle: 'SCANNER CERVICAL' }],
  ['CT', '',           { examType: 'scanner',                  examTitle: 'SCANNER' }],

  // MRI ────────────────────────────────────────────────────────────────────────
  ['MRI', 'lombo',     { examType: 'irm_rachis_lombaire',      examTitle: 'IRM DU RACHIS LOMBO-SACRÉ' }],
  ['MRI', 'lombaire',  { examType: 'irm_rachis_lombaire',      examTitle: 'IRM DU RACHIS LOMBAIRE' }],
  ['MRI', 'lumbar',    { examType: 'irm_rachis_lombaire',      examTitle: 'IRM DU RACHIS LOMBAIRE' }],
  ['MRI', 'rachis',    { examType: 'irm_rachis',               examTitle: 'IRM DU RACHIS' }],
  ['MRI', 'spine',     { examType: 'irm_rachis',               examTitle: 'IRM DU RACHIS' }],
  ['MRI', 'cervical',  { examType: 'irm_rachis_cervical',      examTitle: 'IRM DU RACHIS CERVICAL' }],
  ['MRI', 'cerveau',   { examType: 'irm_cerebrale',            examTitle: 'IRM CÉRÉBRALE' }],
  ['MRI', 'cerebr',    { examType: 'irm_cerebrale',            examTitle: 'IRM CÉRÉBRALE' }],
  ['MRI', 'brain',     { examType: 'irm_cerebrale',            examTitle: 'IRM CÉRÉBRALE' }],
  ['MRI', 'head',      { examType: 'irm_cerebrale',            examTitle: 'IRM CÉRÉBRALE' }],
  ['MRI', 'prostate',  { examType: 'irm_prostate',             examTitle: 'IRM DE LA PROSTATE' }],
  ['MRI', 'genou',     { examType: 'irm_genou',                examTitle: 'IRM DU GENOU' }],
  ['MRI', 'knee',      { examType: 'irm_genou',                examTitle: 'IRM DU GENOU' }],
  ['MRI', 'epaule',    { examType: 'irm_epaule',               examTitle: "IRM DE L'ÉPAULE" }],
  ['MRI', 'shoulder',  { examType: 'irm_epaule',               examTitle: "IRM DE L'ÉPAULE" }],
  ['MRI', 'sein',      { examType: 'irm_sein',                 examTitle: 'IRM DU SEIN' }],
  ['MRI', 'breast',    { examType: 'irm_sein',                 examTitle: 'IRM DU SEIN' }],
  ['MRI', 'abdomen',   { examType: 'irm_abdominale',           examTitle: 'IRM ABDOMINALE' }],
  ['MRI', 'hanche',    { examType: 'irm_hanche',               examTitle: 'IRM DE LA HANCHE' }],
  ['MRI', 'hip',       { examType: 'irm_hanche',               examTitle: 'IRM DE LA HANCHE' }],
  ['MRI', 'cheville',  { examType: 'irm_cheville',             examTitle: 'IRM DE LA CHEVILLE' }],
  ['MRI', 'ankle',     { examType: 'irm_cheville',             examTitle: 'IRM DE LA CHEVILLE' }],
  ['MRI', 'poignet',   { examType: 'irm_poignet',              examTitle: 'IRM DU POIGNET' }],
  ['MRI', 'wrist',     { examType: 'irm_poignet',              examTitle: 'IRM DU POIGNET' }],
  ['MRI', 'foie',      { examType: 'irm_hepatique',            examTitle: 'IRM HÉPATIQUE' }],
  ['MRI', 'liver',     { examType: 'irm_hepatique',            examTitle: 'IRM HÉPATIQUE' }],
  ['MRI', 'coeur',     { examType: 'irm_cardiaque',            examTitle: 'IRM CARDIAQUE' }],
  ['MRI', 'heart',     { examType: 'irm_cardiaque',            examTitle: 'IRM CARDIAQUE' }],
  ['MRI', '',          { examType: 'irm',                      examTitle: 'IRM' }],

  // XR / CR ────────────────────────────────────────────────────────────────────
  ['XR',  'thorax',    { examType: 'radiographie_thorax',      examTitle: 'RADIOGRAPHIE DU THORAX' }],
  ['XR',  'chest',     { examType: 'radiographie_thorax',      examTitle: 'RADIOGRAPHIE DU THORAX' }],
  ['XR',  'abdomen',   { examType: 'radiographie_abdomen',     examTitle: "RADIOGRAPHIE DE L'ABDOMEN" }],
  ['XR',  'rachis',    { examType: 'radiographie_rachis',      examTitle: 'RADIOGRAPHIE DU RACHIS' }],
  ['XR',  'genou',     { examType: 'radiographie_genou',       examTitle: 'RADIOGRAPHIE DU GENOU' }],
  ['XR',  'knee',      { examType: 'radiographie_genou',       examTitle: 'RADIOGRAPHIE DU GENOU' }],
  ['XR',  'crane',     { examType: 'radiographie_crane',       examTitle: 'RADIOGRAPHIE DU CRÂNE' }],
  ['XR',  'skull',     { examType: 'radiographie_crane',       examTitle: 'RADIOGRAPHIE DU CRÂNE' }],
  ['XR',  'main',      { examType: 'radiographie_main',        examTitle: 'RADIOGRAPHIE DE LA MAIN' }],
  ['XR',  'hand',      { examType: 'radiographie_main',        examTitle: 'RADIOGRAPHIE DE LA MAIN' }],
  ['XR',  'pied',      { examType: 'radiographie_pied',        examTitle: 'RADIOGRAPHIE DU PIED' }],
  ['XR',  'foot',      { examType: 'radiographie_pied',        examTitle: 'RADIOGRAPHIE DU PIED' }],
  ['XR',  'poignet',   { examType: 'radiographie_poignet',     examTitle: 'RADIOGRAPHIE DU POIGNET' }],
  ['XR',  'wrist',     { examType: 'radiographie_poignet',     examTitle: 'RADIOGRAPHIE DU POIGNET' }],
  ['XR',  '',          { examType: 'radiographie',             examTitle: 'RADIOGRAPHIE' }],
  ['CR',  'thorax',    { examType: 'radiographie_thorax',      examTitle: 'RADIOGRAPHIE DU THORAX' }],
  ['CR',  '',          { examType: 'radiographie',             examTitle: 'RADIOGRAPHIE' }],

  // US ─────────────────────────────────────────────────────────────────────────
  ['US',  'obstetric', { examType: 'echographie_obstetricale', examTitle: 'ÉCHOGRAPHIE OBSTÉTRICALE' }],
  ['US',  'thyroid',   { examType: 'echographie_thyroidienne', examTitle: 'ÉCHOGRAPHIE THYROÏDIENNE' }],
  ['US',  'thyroide',  { examType: 'echographie_thyroidienne', examTitle: 'ÉCHOGRAPHIE THYROÏDIENNE' }],
  ['US',  'cardiaque', { examType: 'echographie_cardiaque',    examTitle: 'ÉCHOGRAPHIE CARDIAQUE' }],
  ['US',  'cardiac',   { examType: 'echographie_cardiaque',    examTitle: 'ÉCHOGRAPHIE CARDIAQUE' }],
  ['US',  'coeur',     { examType: 'echographie_cardiaque',    examTitle: 'ÉCHOGRAPHIE CARDIAQUE' }],
  ['US',  'heart',     { examType: 'echographie_cardiaque',    examTitle: 'ÉCHOGRAPHIE CARDIAQUE' }],
  ['US',  'abdomen',   { examType: 'echographie_abdominale',   examTitle: 'ÉCHOGRAPHIE ABDOMINALE' }],
  ['US',  'pelvis',    { examType: 'echographie_pelvienne',    examTitle: 'ÉCHOGRAPHIE PELVIENNE' }],
  ['US',  'sein',      { examType: 'echographie_mammaire',     examTitle: 'ÉCHOGRAPHIE MAMMAIRE' }],
  ['US',  'breast',    { examType: 'echographie_mammaire',     examTitle: 'ÉCHOGRAPHIE MAMMAIRE' }],
  ['US',  'foie',      { examType: 'echographie_hepatique',    examTitle: 'ÉCHOGRAPHIE HÉPATIQUE' }],
  ['US',  'liver',     { examType: 'echographie_hepatique',    examTitle: 'ÉCHOGRAPHIE HÉPATIQUE' }],
  ['US',  'kidney',    { examType: 'echographie_renale',       examTitle: 'ÉCHOGRAPHIE RÉNALE' }],
  ['US',  'rein',      { examType: 'echographie_renale',       examTitle: 'ÉCHOGRAPHIE RÉNALE' }],
  ['US',  'prostate',  { examType: 'echographie_prostate',     examTitle: 'ÉCHOGRAPHIE DE LA PROSTATE' }],
  ['US',  '',          { examType: 'echographie',              examTitle: 'ÉCHOGRAPHIE' }],

  // Other modalities ────────────────────────────────────────────────────────────
  ['MG',  '',          { examType: 'mammographie',             examTitle: 'MAMMOGRAPHIE' }],
  ['NM',  '',          { examType: 'scintigraphie',            examTitle: 'SCINTIGRAPHIE' }],
  ['PT',  '',          { examType: 'pet_scan',                 examTitle: 'PET-SCAN' }],
  ['DX',  '',          { examType: 'radiographie',             examTitle: 'RADIOGRAPHIE' }],
]

// French technique templates per modality
const FR_TECHNIQUES: Record<string, string> = {
  CT:  'Scanner réalisé en acquisition volumique sans puis après injection de produit de contraste iodé, avec reconstructions multiplanaires.',
  MRI: 'IRM réalisée en séquences multiplanaires : T1, T2, FLAIR, diffusion (b0 et b1000), séquences T1 injectées avec saturation de la graisse.',
  XR:  'Radiographies standard réalisées de face et de profil.',
  CR:  'Radiographies standard réalisées de face et de profil.',
  US:  'Échographie réalisée par voie transcutanée avec sonde haute fréquence, en mode B et Doppler couleur.',
  MG:  'Mammographie réalisée bilatéralement et comparativement, en incidences de face (CC) et oblique externe (OBL).',
  NM:  'Scintigraphie réalisée après injection intraveineuse du radiopharmaceutique selon le protocole standard.',
  PT:  'PET-scan réalisé après injection intraveineuse de 18F-FDG, avec période de jeûne de 6 heures.',
  DX:  'Radiographie numérique réalisée selon le protocole standard.',
}

// ─── Public helpers ───────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function buildExamInfo(modality: string | null, bodyPart: string | null): ExamInfo {
  if (!modality) return { examType: 'examen_radiologique', examTitle: 'EXAMEN RADIOLOGIQUE' }

  const mod      = modality.toUpperCase()
  const bodyNorm = norm(bodyPart ?? '')

  for (const [mapMod, mapBody, info] of MODALITY_BODY_MAP) {
    if (mapMod !== mod) continue
    if (!mapBody) continue
    if (bodyNorm.includes(norm(mapBody))) return info
  }

  // Fallback: modality only (entry with empty body)
  for (const [mapMod, mapBody, info] of MODALITY_BODY_MAP) {
    if (mapMod === mod && mapBody === '') return info
  }

  const modLabel = ({ CT: 'SCANNER', MRI: 'IRM', XR: 'RADIOGRAPHIE', CR: 'RADIOGRAPHIE', US: 'ÉCHOGRAPHIE', MG: 'MAMMOGRAPHIE', NM: 'SCINTIGRAPHIE', PT: 'PET-SCAN', DX: 'RADIOGRAPHIE' } as Record<string, string>)[mod] ?? mod
  const bodyLabel = bodyPart ? ` — ${bodyPart.toUpperCase()}` : ''
  return { examType: `examen_${mod.toLowerCase()}`, examTitle: `${modLabel}${bodyLabel}` }
}

export function buildDefaultTechnique(modality: string | null): string {
  if (!modality) return ''
  return FR_TECHNIQUES[modality.toUpperCase()] ?? 'Examen réalisé selon le protocole standard.'
}

// ─── Section parser ───────────────────────────────────────────────────────────

/**
 * R2.6 — routing is delegated to the sentence-level router.
 *
 * The old implementation split on header keywords and then ran a fallback
 * guarded by `!foundSections || (!sections.results && !sections.conclusion)`.
 * That `||` fired the fallback even when a header HAD been found, copying the
 * whole transcript into RÉSULTATS: "Indication traumatisme crânien." produced
 * the same sentence in both INDICATION and RÉSULTATS. The router routes every
 * sentence to at most one section and has no such pass.
 *
 * `parseStructuredText` keeps its signature and its role: sections in, canonical
 * StructuredReportData out. Callers that want provenance use
 * `parseStructuredTextWithProvenance`.
 */
export function parseStructuredText(freeText: string, context: HpdContext): StructuredReportData {
  return parseStructuredTextWithProvenance(freeText, context).data
}

export interface ParsedWithProvenance {
  data: StructuredReportData
  /** Why each populated section holds what it holds. */
  provenance: Partial<Record<SectionKey, SectionProvenance>>
  /** Source ranges in the transcript, for review flags that point at a sentence. */
  ranges: Partial<Record<SectionKey, Array<{ start: number; end: number }>>>
}

export function parseStructuredTextWithProvenance(
  freeText: string,
  context: HpdContext,
): ParsedWithProvenance {
  const text                    = freeText.trim()
  const { examType, examTitle } = buildExamInfo(context.modality, context.bodyPart)

  const routed = routeTranscript(text)
  const sections: Partial<Record<SectionKey, string>> = {}
  const provenance: Partial<Record<SectionKey, SectionProvenance>> = {}
  const ranges: Partial<Record<SectionKey, Array<{ start: number; end: number }>>> = {}

  for (const [key, value] of Object.entries(routed.sections) as [SectionKey, { text: string; provenance: SectionProvenance; ranges: Array<{ start: number; end: number }> }][]) {
    sections[key]   = value.text
    provenance[key] = value.provenance
    ranges[key]     = value.ranges
  }

  // The protocol template is the one string in this product nobody dictated. It
  // is always marked auto_filled so downstream can flag it for confirmation.
  if (!sections.technique && context.modality) {
    const template = buildDefaultTechnique(context.modality)
    if (template) {
      sections.technique   = template
      provenance.technique = 'auto_filled'
    }
  }

  const data: StructuredReportData = {
    language:    (context.locale ?? 'fr') as 'fr' | 'en',
    examType,
    examTitle,
    patient: {
      name: context.patientName || '—',
      age:  context.patientAge  || '—',
      sex:  context.patientSex  || '—',
    },
    indication:      sections.indication      ?? '',
    technique:       sections.technique       ?? '',
    results:         sections.results         ?? '',
    conclusion:      sections.conclusion      ?? '',
    recommendations: sections.recommendations || undefined,
    dictationTranscript: freeText,
    generatedAt:     new Date().toISOString(),
  }

  return { data, provenance, ranges }
}
