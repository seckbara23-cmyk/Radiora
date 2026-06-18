import type { StructuredReportData } from '@/types/report'

export type { StructuredReportData }

export interface HpdContext {
  modality:    string | null
  bodyPart:    string | null
  patientName: string
  patientAge:  string
  patientSex:  string
  locale?:     string
}

// ─── Section keywords ─────────────────────────────────────────────────────────

type SectionKey = 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'

const SECTION_KEYWORDS: Record<SectionKey, string[]> = {
  indication: [
    'renseignements cliniques', 'renseignement clinique',
    'contexte clinique', "motif d'examen", 'motif',
    'indication clinique', 'indication',
    'clinical indication', 'clinical history', 'history',
  ],
  technique: [
    "protocole d'acquisition", 'protocole', "technique d'acquisition",
    'technique', 'procédure', 'procedure', 'method',
  ],
  results: [
    "résultats de l'examen", 'résultats', 'resultats',
    'aspect radiologique', 'aspects radiologiques',
    'description', 'observations', 'findings', 'results',
  ],
  conclusion: [
    'en conclusion', 'au total', 'en résumé',
    'conclusion', 'synthèse', 'synthese',
    'impression', 'assessment', 'interpretation',
  ],
  recommendations: [
    'conduite à tenir', 'préconisations', 'préconisation',
    'recommandations', 'recommandation',
    'recommendations', 'recommendation', 'follow-up', 'follow up',
  ],
}

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

function matchSectionKey(partStart: string): SectionKey | null {
  const n = norm(partStart.slice(0, 80))
  for (const [key, keywords] of Object.entries(SECTION_KEYWORDS) as [SectionKey, string[]][]) {
    for (const kw of keywords.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(
        `^${norm(kw).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&').replace(/\s+/g, '\\s+')}\\s*[:\\n]?`,
        'i',
      )
      if (re.test(n)) return key
    }
  }
  return null
}

export function parseStructuredText(freeText: string, context: HpdContext): StructuredReportData {
  const text                   = freeText.trim()
  const { examType, examTitle } = buildExamInfo(context.modality, context.bodyPart)

  // Build split regex from all known keywords
  const allKw = [...new Set(Object.values(SECTION_KEYWORDS).flat())]
  const sorted = allKw.sort((a, b) => b.length - a.length)
  const escapedKw = sorted
    .map((k) => norm(k).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|')

  // Split on section headers ("KEYWORD :" or "KEYWORD\n")
  const splitRe = new RegExp(`(?=(?:${escapedKw})\\s*[:\\n])`, 'gi')
  const parts   = text.split(splitRe).filter(Boolean)

  const sections: Partial<Record<SectionKey, string>> = {}
  let foundSections = false

  for (const part of parts) {
    const key = matchSectionKey(part)
    if (key && !sections[key]) {
      foundSections = true
      // Strip header + colon/newline + leading whitespace
      const stripped = part.replace(/^[^\n:]+[:\n]\s*/i, '').trim()
      sections[key] = stripped
    }
  }

  // Fallback: no recognisable headers → sentence-proportion split
  if (!foundSections || (!sections.results && !sections.conclusion)) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
    if (sentences.length >= 2) {
      const cutoff = Math.max(1, Math.ceil(sentences.length * 0.7))
      if (!sections.results)    sections.results    = sentences.slice(0, cutoff).join(' ')
      if (!sections.conclusion) sections.conclusion = sentences.slice(cutoff).join(' ')
    } else {
      if (!sections.results) sections.results = text
    }
  }

  if (!sections.technique && context.modality) {
    sections.technique = buildDefaultTechnique(context.modality)
  }

  return {
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
}
