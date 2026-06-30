// Phase 6B — Live browser dictation helpers.
//
// Pure & deterministic (no DOM, no network, no persistence) so the live preview
// can run client-side on every speech tick and be unit-tested. It REUSES the
// existing F7 engine (runStructuring → self-correction + French cleanup + HPD
// parser + confidence) and the medical-term correction dictionary. The only new
// piece is a small accent-restoration pass for live transcripts, surfaced as
// highlightable corrections.

import { runStructuring } from '@/lib/ai/structuring-engine'
import { findMedicalCorrections, applyAllCorrections, type DetectedCorrection } from '@/lib/ai/voice-corrections'
import type { StructuringResult } from '@/types/structuring'

// ── Browser support (testable with a window-like object) ──────────────────────
export function isSpeechRecognitionSupported(win: unknown): boolean {
  if (!win || typeof win !== 'object') return false
  const w = win as Record<string, unknown>
  return 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w
}

// Friendly browser name from a user-agent string (for the diagnostic card).
// Order matters: Edge/Opera UAs also contain "Chrome".
export function detectBrowserName(userAgent: string): string {
  const ua = userAgent || ''
  if (/\bEdg(e|A|iOS)?\//i.test(ua)) return 'Edge'
  if (/\bOPR\/|\bOpera\b/i.test(ua)) return 'Opera'
  if (/\bChrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome'
  if (/\bChromium\//i.test(ua)) return 'Chromium'
  if (/\bFirefox\//i.test(ua)) return 'Firefox'
  if (/\bSafari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari'
  return 'Autre'
}

// Combine a freshly dictated transcript with existing text (comparison mode).
export function combineTranscript(
  mode: 'replace' | 'append',
  existing: string,
  incoming: string,
): string {
  const inc = (incoming ?? '').trim()
  if (mode === 'replace') return inc
  const ex = (existing ?? '').trim()
  if (!ex) return inc
  if (!inc) return ex
  return `${ex}\n${inc}`
}

// ── Accent restoration for common radiology terms ─────────────────────────────
// Web Speech sometimes drops diacritics. These restore them. They are word-bound,
// case-insensitive, and only touch specific medical nouns/adjectives — NEVER
// negation ("pas", "sans", "non") or uncertainty ("probable", "possible",
// "suspicion") vocabulary, so clinical meaning is preserved.
interface AccentRule {
  term: string
  pattern: RegExp
  replacement: string
}

export const LIVE_ACCENT_CORRECTIONS: AccentRule[] = [
  { term: 'cérébral',       pattern: /\bcerebral\b/gi,        replacement: 'cérébral' },
  { term: 'cérébrale',      pattern: /\bcerebrale\b/gi,       replacement: 'cérébrale' },
  { term: 'épanchement',    pattern: /\bepanchement\b/gi,     replacement: 'épanchement' },
  { term: 'adénopathie',    pattern: /\badenopathie\b/gi,     replacement: 'adénopathie' },
  { term: 'adénopathies',   pattern: /\badenopathies\b/gi,    replacement: 'adénopathies' },
  { term: 'lésion',         pattern: /\blesion\b/gi,          replacement: 'lésion' },
  { term: 'lésions',        pattern: /\blesions\b/gi,         replacement: 'lésions' },
  { term: 'hématome',       pattern: /\bhematome\b/gi,        replacement: 'hématome' },
  { term: 'hémorragie',     pattern: /\bhemorragie\b/gi,      replacement: 'hémorragie' },
  { term: 'ischémie',       pattern: /\bischemie\b/gi,        replacement: 'ischémie' },
  { term: 'ischémique',     pattern: /\bischemique\b/gi,      replacement: 'ischémique' },
  { term: 'sténose',        pattern: /\bstenose\b/gi,         replacement: 'sténose' },
  { term: 'œdème',          pattern: /\boedeme\b/gi,          replacement: 'œdème' },
  { term: 'épaississement', pattern: /\bepaississement\b/gi,  replacement: 'épaississement' },
  { term: 'dégénératif',    pattern: /\bdegeneratif\b/gi,     replacement: 'dégénératif' },
  { term: 'métastase',      pattern: /\bmetastase\b/gi,       replacement: 'métastase' },
  { term: 'métastases',     pattern: /\bmetastases\b/gi,      replacement: 'métastases' },
  { term: 'pédiculé',       pattern: /\bpedicule\b/gi,        replacement: 'pédiculé' },
]

function findAccentCorrections(text: string): DetectedCorrection[] {
  const out: DetectedCorrection[] = []
  for (const rule of LIVE_ACCENT_CORRECTIONS) {
    rule.pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.pattern.exec(text)) !== null) {
      out.push({
        term: rule.term,
        original: m[0],
        replacement: rule.replacement,
        startIndex: m.index,
        endIndex: m.index + m[0].length,
      })
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++
    }
  }
  return out
}

// Merge the existing spacing/terminology dictionary with the accent pass, drop
// overlaps, and sort by position so applyAllCorrections can walk them safely.
export function findLiveCorrections(text: string): DetectedCorrection[] {
  const all = [...findMedicalCorrections(text), ...findAccentCorrections(text)]
    .sort((a, b) => a.startIndex - b.startIndex)
  const merged: DetectedCorrection[] = []
  let lastEnd = -1
  for (const c of all) {
    if (c.startIndex < lastEnd) continue // overlaps a kept correction — skip
    merged.push(c)
    lastEnd = c.endIndex
  }
  return merged
}

// Live medical cleanup: returns the term-corrected text plus the corrections for
// highlighting. Does not touch fillers/structure (that happens in runStructuring).
export function liveCleanup(text: string): { cleaned: string; corrections: DetectedCorrection[] } {
  const corrections = findLiveCorrections(text)
  const cleaned = corrections.length ? applyAllCorrections(text, corrections) : text
  return { cleaned, corrections }
}

// ── Live preview (reuses the F7 engine) ───────────────────────────────────────
export interface LivePreviewContext {
  modality?: string | null
  bodyPart?: string | null
  patientName?: string
  patientAge?: string
  patientSex?: string
  locale?: string
}

export interface LivePreview {
  raw: string
  termCorrections: DetectedCorrection[]
  result: StructuringResult
}

// Compute the full live preview for a raw transcript. PURE — no save, no network.
// Pipeline: accent/term cleanup → existing F7 engine (self-correction → French
// cleanup → HPD structuring → confidence).
export function computeLivePreview(rawText: string, ctx: LivePreviewContext = {}): LivePreview {
  const raw = rawText ?? ''
  const { cleaned, corrections } = liveCleanup(raw)
  const result = runStructuring({
    rawTranscript: cleaned,
    modality: ctx.modality ?? null,
    bodyPart: ctx.bodyPart ?? null,
    patientName: ctx.patientName ?? '',
    patientAge: ctx.patientAge ?? '',
    patientSex: ctx.patientSex ?? '',
    locale: ctx.locale ?? 'fr',
  })
  return { raw, termCorrections: corrections, result }
}
