// F18 — Special structured exam forms (canonical schemas).
//
// Some exams are reported as measurement tables, not free text: Mammographie,
// Scannopelvimétrie and TAGT (télémétrie des membres inférieurs). This module
// defines, declaratively, the table for each one — the columns the radiologist
// fills and the rows (parameters) to measure.
//
// PURE and deterministic: no IO, no AI. Reference ("usual") values are textbook
// anatomical constants shown only as guidance next to the radiologist's own
// measurement — Radiora never measures, computes or concludes anything itself.
// Labels are French by default (Senegal pilot).

import type { SpecialLayout } from '@/types/exam'

export interface SpecialFormColumn {
  /** Stable key used in the value map (`${rowKey}__${colKey}`). */
  key: string
  /** French column header shown in the editor and exports. */
  label: string
}

export interface SpecialFormRow {
  key: string
  label: string
  /** Measurement unit appended to the label, e.g. 'mm', '°'. */
  unit?: string
  /** Usual/normal reference value — guidance only, never a measurement. */
  reference?: string
  /** Required for a complete report (UI enforces before finalizing). */
  required?: boolean
}

export interface SpecialFormSchema {
  layout: SpecialLayout
  /** examType key (matches the exam catalog slug). */
  examType: string
  /** Display title for the report header. */
  title: string
  /** Default TECHNIQUE paragraph (radiologist edits before signing). */
  defaultTechnique: string
  /** Short guidance shown above the table in the editor. */
  instructions: string
  /** Columns the radiologist fills (single-column forms use one 'valeur' column). */
  valueColumns: SpecialFormColumn[]
  /** Whether to render the reference ("Valeur usuelle") column. */
  showReference: boolean
  rows: SpecialFormRow[]
}

const MAMMOGRAPHIE: SpecialFormSchema = {
  layout: 'mammographie',
  examType: 'mammographie',
  title: 'MAMMOGRAPHIE',
  defaultTechnique:
    'Mammographie numérique bilatérale et comparative, incidences de face (cranio-caudale) et oblique externe (médio-latérale oblique).',
  instructions:
    'Renseignez les constatations par sein. La classification ACR (BI-RADS) est obligatoire.',
  showReference: false,
  valueColumns: [
    { key: 'droit', label: 'Sein droit' },
    { key: 'gauche', label: 'Sein gauche' },
  ],
  rows: [
    { key: 'densite', label: 'Densité mammaire (ACR a/b/c/d)' },
    { key: 'masse', label: 'Masse / opacité' },
    { key: 'microcalcifications', label: 'Microcalcifications' },
    { key: 'distorsion', label: 'Distorsion architecturale' },
    { key: 'asymetrie', label: 'Asymétrie' },
    { key: 'ganglions', label: 'Ganglions axillaires' },
    { key: 'classification', label: 'Classification ACR (BI-RADS)', required: true },
  ],
}

const SCANNOPELVIMETRIE: SpecialFormSchema = {
  layout: 'scannopelvimetrie',
  examType: 'scannopelvimetrie',
  title: 'SCANNOPELVIMÉTRIE',
  defaultTechnique:
    'Scannopelvimétrie par tomodensitométrie basse dose, mesures réalisées sur reconstructions sagittale médiane et axiale.',
  instructions:
    'Saisissez chaque diamètre mesuré en millimètres. Les valeurs usuelles sont indiquées à titre de repère uniquement.',
  showReference: true,
  valueColumns: [{ key: 'valeur', label: 'Valeur' }],
  rows: [
    { key: 'prp', label: 'Diamètre promonto-rétro-pubien (PRP)', unit: 'mm', reference: '≥ 105 mm', required: true },
    { key: 'tm', label: 'Diamètre transverse médian (TM)', unit: 'mm', reference: '≥ 125 mm', required: true },
    { key: 'bisciatique', label: 'Diamètre bisciatique (bi-épineux)', unit: 'mm', reference: '≥ 100 mm', required: true },
    { key: 'magnin', label: 'Indice de Magnin (PRP + TM)', unit: 'mm', reference: '≥ 230 mm', required: true },
    { key: 'conjugue', label: 'Conjugué obstétrical', unit: 'mm', reference: '≥ 105 mm' },
  ],
}

const TAGT: SpecialFormSchema = {
  layout: 'tagt',
  examType: 'telemetrie_des_membres_inferieurs_tagt',
  title: 'TÉLÉMÉTRIE DES MEMBRES INFÉRIEURS (TAGT)',
  defaultTechnique:
    'Télémétrie des membres inférieurs en charge (goniométrie), mesures des longueurs segmentaires et des axes mécaniques.',
  instructions:
    'Saisissez les longueurs (mm) et les angles (°) pour chaque membre.',
  showReference: false,
  valueColumns: [
    { key: 'droit', label: 'Membre droit' },
    { key: 'gauche', label: 'Membre gauche' },
  ],
  rows: [
    { key: 'femur', label: 'Longueur fémorale', unit: 'mm', required: true },
    { key: 'tibia', label: 'Longueur tibiale', unit: 'mm', required: true },
    { key: 'total', label: 'Longueur totale du membre', unit: 'mm' },
    { key: 'hka', label: 'Axe mécanique global (HKA)', unit: '°' },
    { key: 'femorotibial', label: 'Angle fémoro-tibial mécanique', unit: '°' },
    { key: 'inegalite', label: 'Inégalité de longueur', unit: 'mm' },
  ],
}

export const SPECIAL_FORMS: Record<SpecialLayout, SpecialFormSchema> = {
  mammographie: MAMMOGRAPHIE,
  scannopelvimetrie: SCANNOPELVIMETRIE,
  tagt: TAGT,
}

export const SPECIAL_LAYOUTS: readonly SpecialLayout[] = ['mammographie', 'scannopelvimetrie', 'tagt']

export function getSpecialForm(layout: SpecialLayout): SpecialFormSchema {
  return SPECIAL_FORMS[layout]
}

/** Resolve a special layout from an examType key, or null for ordinary exams. */
export function specialLayoutForExamType(examType: string | null | undefined): SpecialLayout | null {
  if (!examType) return null
  const match = SPECIAL_LAYOUTS.find((l) => SPECIAL_FORMS[l].examType === examType)
  return match ?? null
}
