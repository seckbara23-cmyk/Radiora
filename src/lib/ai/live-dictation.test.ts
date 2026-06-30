import { describe, it, expect } from 'vitest'
import {
  isSpeechRecognitionSupported,
  liveCleanup,
  findLiveCorrections,
  computeLivePreview,
} from '@/lib/ai/live-dictation'

// ── 6B browser support fallback logic ─────────────────────────────────────────
describe('isSpeechRecognitionSupported', () => {
  it('detects the standard and webkit APIs', () => {
    expect(isSpeechRecognitionSupported({ SpeechRecognition: () => {} })).toBe(true)
    expect(isSpeechRecognitionSupported({ webkitSpeechRecognition: () => {} })).toBe(true)
  })
  it('returns false when unsupported or absent', () => {
    expect(isSpeechRecognitionSupported({})).toBe(false)
    expect(isSpeechRecognitionSupported(null)).toBe(false)
    expect(isSpeechRecognitionSupported(undefined)).toBe(false)
  })
})

// ── 6B.2 live medical cleanup ─────────────────────────────────────────────────
describe('liveCleanup', () => {
  it('restores accents on common radiology terms (spec examples)', () => {
    expect(liveCleanup('scanner cerebral').cleaned).toBe('scanner cérébral')
    expect(liveCleanup('epanchement').cleaned).toBe('épanchement')
    expect(liveCleanup('adenopathie').cleaned).toBe('adénopathie')
  })

  it('surfaces the corrections for highlighting (from → to)', () => {
    const { corrections } = liveCleanup('petit epanchement et adenopathie')
    const terms = corrections.map((c) => c.replacement)
    expect(terms).toContain('épanchement')
    expect(terms).toContain('adénopathie')
  })

  it('preserves negation and uncertainty (never changes clinical meaning)', () => {
    const neg = liveCleanup("pas d'epanchement pleural").cleaned
    expect(neg).toContain('pas')
    expect(neg).toContain('épanchement')
    const unc = liveCleanup('lesion probable du foie').cleaned
    expect(unc).toContain('probable')
    expect(unc).toContain('lésion')
  })

  it('leaves clean input untouched', () => {
    const { cleaned, corrections } = liveCleanup('foie de taille normale')
    expect(cleaned).toBe('foie de taille normale')
    expect(corrections).toHaveLength(0)
  })

  it('also applies the existing spacing/terminology dictionary', () => {
    // "adéno pathie" → "adénopathie" comes from the reused MEDICAL_CORRECTIONS.
    expect(findLiveCorrections('adéno pathie').length).toBeGreaterThan(0)
  })
})

// ── 6B.3 live HPD structuring preview ─────────────────────────────────────────
describe('computeLivePreview — HPD preview', () => {
  it('produces structured HPD sections from dictated headers', () => {
    const raw =
      'Indication : bilan douleur. Technique : scanner abdominal. ' +
      "Résultats : pas d'anomalie décelable. Conclusion : examen normal."
    const { result } = computeLivePreview(raw, { modality: 'CT', bodyPart: 'abdomen' })
    expect(result.structured.indication.toLowerCase()).toContain('bilan')
    expect(result.structured.results.length).toBeGreaterThan(0)
    expect(result.structured.conclusion.toLowerCase()).toContain('normal')
  })

  it('is pure and deterministic — no side effects, no auto-save', () => {
    const raw = 'Indication : contrôle. Conclusion : sans particularité.'
    const a = computeLivePreview(raw, { modality: 'US', bodyPart: 'abdomen' })
    const b = computeLivePreview(raw, { modality: 'US', bodyPart: 'abdomen' })
    // Same input → identical text output (idempotent), proving no hidden state /
    // persistence. We compare the deterministic, content-bearing fields (the
    // structured object also carries the exam date, which is not relevant here).
    expect(b.result.cleanedTranscript).toBe(a.result.cleanedTranscript)
    expect(b.result.structured.indication).toBe(a.result.structured.indication)
    expect(b.result.structured.results).toBe(a.result.structured.results)
    expect(b.result.structured.conclusion).toBe(a.result.structured.conclusion)
    expect(b.termCorrections).toEqual(a.termCorrections)
  })
})

// ── 6B.4 live self-correction handling ────────────────────────────────────────
describe('computeLivePreview — self-correction', () => {
  it('keeps the corrected statement and drops the retracted one', () => {
    const raw = "Pas d'épanchement pleural. Non. Fine lame pleurale gauche."
    const { result } = computeLivePreview(raw)
    expect(result.cleanedTranscript).toContain('Fine lame pleurale gauche')
    expect(result.cleanedTranscript).not.toContain("Pas d'épanchement pleural")
    expect(result.correctionEvents.length).toBeGreaterThan(0)
  })
})
