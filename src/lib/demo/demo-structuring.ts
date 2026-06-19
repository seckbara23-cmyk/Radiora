// Public landing-page demo — deterministic structuring wrapper.
//
// SAFETY / why this is a public-safe wrapper:
//   • It only calls the PURE, local Feature-7 engine (no network, no DB, no PHI
//     leaving the browser, no external AI). The same code runs client-side.
//   • It exposes NO internal report API, server action, or data-layer call.
//   • It never persists anything — callers pass a string in and get a value out.
//   • It infers the exam type from keywords in the dictation only (the public
//     demo has no separate modality field), so a doctor can paste free text.
//
// The transformation itself is the real product pipeline:
//   raw → detectSelfCorrections → cleanupFrench → parseStructuredText (HPD).

import { runStructuring } from '@/lib/ai/structuring-engine'
import { detectSelfCorrections } from '@/lib/ai/self-correction'
import type { DemoPatient } from '@/lib/demo/demo-samples'
import type { StructuredReportData } from '@/types/report'

export type { DemoPatient } from '@/lib/demo/demo-samples'

export type DemoSectionKey = 'indication' | 'technique' | 'results' | 'conclusion' | 'recommendations'

export interface DemoSection {
  key:   DemoSectionKey
  /** Canonical French HPD label, identical to the printed report. */
  label: string
  body:  string
}

export interface DemoCorrection {
  marker:  string
  removed: string
  kept:    string
}

export interface DemoRemoved {
  text:   string
  reason: 'filler' | 'repetition'
}

export interface DemoResult {
  raw:           string
  /** Transcript after dictated self-corrections are resolved (pre-cleanup). */
  corrected:     string
  /** Transcript after French cleanup (fillers / repetitions / terminology). */
  cleaned:       string
  corrections:   DemoCorrection[]
  removedTokens: DemoRemoved[]
  examTitle:     string
  patient:       DemoPatient
  /** Non-empty HPD sections in fixed clinical order. */
  sections:      DemoSection[]
  structured:    StructuredReportData
  /** True when the engine flagged any section for radiologist review. */
  reviewRequired: boolean
}

// HPD section labels — French, matching the printed report exactly (the product's
// report is always in French HPD format regardless of UI language).
const SECTION_LABELS: Record<DemoSectionKey, string> = {
  indication:      'INDICATION',
  technique:       'TECHNIQUE',
  results:         'RÉSULTATS',
  conclusion:      'CONCLUSION',
  recommendations: 'RECOMMANDATIONS',
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Best-effort modality + body-part inference from dictation keywords. Returns the
 * canonical tokens that hpd-engine's MODALITY_BODY_MAP understands. Unknown text
 * → { modality: null } (the engine then yields a generic "EXAMEN RADIOLOGIQUE").
 */
export function inferExam(text: string): { modality: string | null; bodyPart: string | null } {
  const n = norm(text)

  let modality: string | null = null
  if (/\b(scanner|tomodensitom|tdm)\b/.test(n)) modality = 'CT'
  else if (/\b(irm|resonance magnetique)\b/.test(n)) modality = 'MRI'
  else if (/\b(echographie|echo doppler|doppler)\b/.test(n)) modality = 'US'
  else if (/\bmammographie\b/.test(n)) modality = 'MG'
  else if (/\b(radiographie|radio)\b/.test(n)) modality = 'XR'

  // Body region → token the exam-title map keys on. Order matters (first match
  // wins): the dictated exam region (e.g. "abdominale") takes priority over an
  // organ named only in the findings (e.g. "vésiculaire").
  const BODY: Array<[RegExp, string]> = [
    [/\b(cerebr|cranien|crane|cerveau|encephal)/,                          'cerveau'],
    [/\b(thorax|thoracique|pulmonaire|poumon|pleural|pleurale|mediastin)/, 'thorax'],
    [/\b(abdomen|abdominal|abdominale)/,                                   'abdomen'],
    [/\b(pelvi|pelvien|pelvienne)/,                                        'pelvis'],
    [/\b(rachis|lombaire|lombo|vertebr)/,                                  'rachis'],
    [/\b(hepat|foie|vesicul|biliaire|hypochondre)/,                        'foie'],
    [/\b(renal|rein|nephro)/,                                              'rein'],
    [/\b(thyroid)/,                                                        'thyroide'],
    [/\b(genou)/,                                                          'genou'],
    [/\b(prostate)/,                                                       'prostate'],
  ]
  let bodyPart: string | null = null
  for (const [re, token] of BODY) {
    if (re.test(n)) { bodyPart = token; break }
  }

  return { modality, bodyPart }
}

/**
 * Runs the full demo pipeline on a dictation string. Pure and deterministic.
 * `patient` is optional fictional metadata for the preview's identity box; when
 * omitted the box shows placeholders (used for free-text input — we never echo
 * user-entered identity as if it were a real patient).
 */
export function runDemo(raw: string, patient?: DemoPatient): DemoResult {
  const text = (raw ?? '').trim()
  const safePatient: DemoPatient = patient ?? { name: '—', age: '—', sex: '—' }

  // Expose the intermediate self-corrected transcript (the engine consumes it
  // internally but does not return it) for the "Correction" step.
  const { corrected } = detectSelfCorrections(text)
  const { modality, bodyPart } = inferExam(text)

  const result = runStructuring({
    rawTranscript: text,
    modality,
    bodyPart,
    patientName: safePatient.name,
    patientAge:  safePatient.age,
    patientSex:  safePatient.sex,
    locale:      'fr',
  })

  const sd = result.structured
  const sections: DemoSection[] = []
  const add = (key: DemoSectionKey, body: string | undefined) => {
    const b = (body ?? '').trim()
    if (b) sections.push({ key, label: SECTION_LABELS[key], body: b })
  }
  add('indication', sd.indication)
  add('technique', sd.technique)
  add('results', sd.results)
  add('conclusion', sd.conclusion)
  add('recommendations', sd.recommendations)

  return {
    raw:            text,
    corrected,
    cleaned:        result.cleanedTranscript,
    corrections:    result.correctionEvents.map((e) => ({ marker: e.marker, removed: e.removed, kept: e.kept })),
    removedTokens:  result.removedTokens.map((r) => ({ text: r.text, reason: r.reason })),
    examTitle:      sd.examTitle,
    patient:        safePatient,
    sections,
    structured:     sd,
    reviewRequired: result.reviewRequired,
  }
}
