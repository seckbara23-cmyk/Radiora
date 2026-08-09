import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import { evaluateReportWrite } from '@/lib/safety/immutability'

// R2.0 — the radiologist-facing structuring path.
//
// buildHpdDraft is the clinical core of the generateHPDDraft server action
// (the action adds only auth, the ai_jobs/ai_outputs rows and the audit entry),
// so these test the behaviour the radiologist actually gets.
//
// Before R2.0 this path called parseStructuredText DIRECTLY and therefore had
// no self-correction, no French cleanup and no confidence scoring. Every test
// below fails against that bypass.

const ctx = { modality: 'CT', bodyPart: 'cerveau' } as const
const draft = (rawTranscript: string, over: Partial<Parameters<typeof buildHpdDraft>[0]> = {}) =>
  buildHpdDraft({ rawTranscript, ...ctx, ...over })

describe('1. canonical structuring behaviour is invoked', () => {
  it('applies self-correction — the retracted clause does not survive', () => {
    // parseStructuredText alone cannot do this; only runStructuring can.
    const { output } = draft("Pas d'épanchement pleural. Non. Fine lame pleurale gauche.")
    const all = `${output.results} ${output.conclusion}`
    expect(all).toContain('Fine lame pleurale gauche')
    expect(all).not.toContain("Pas d'épanchement pleural")
  })

  it('applies French cleanup — dictation fillers are removed', () => {
    const { output, structuring } = draft(
      'Résultats : euh contusion frontale droite. Conclusion : euh aspect compatible.',
    )
    expect(`${output.results} ${output.conclusion}`).not.toMatch(/\beuh\b/i)
    expect(structuring.removedTokens.some((t) => t.reason === 'filler')).toBe(true)
  })

  it('preserves the raw transcript as provenance, distinct from the cleaned layer', () => {
    const raw = 'Résultats : euh contusion frontale droite.'
    const { output, structuring } = draft(raw)
    expect(structuring.rawTranscript).toBe(raw)
    expect(output.dictationTranscript).toBe(raw)
    expect(structuring.cleanedTranscript).not.toBe(structuring.rawTranscript)
  })
})

describe('2–3. correction events and confidence metadata are returned', () => {
  it('returns correction events for a dictated retraction', () => {
    const { structuring } = draft("Pas d'épanchement pleural. Non. Fine lame pleurale gauche.")
    expect(structuring.correctionEvents.length).toBeGreaterThan(0)
    expect(structuring.correctionEvents[0].removed).toContain("Pas d'épanchement")
  })

  it('returns per-section confidence for all five sections', () => {
    const { structuring } = draft('Indication : céphalées. Résultats : pas d’anomalie. Conclusion : normal.')
    expect(structuring.confidence.map((c) => c.section).sort()).toEqual(
      ['conclusion', 'indication', 'recommendations', 'results', 'technique'],
    )
    expect(typeof structuring.reviewRequired).toBe('boolean')
  })

  it('returns advisory clinical warnings', () => {
    const { structuring } = draft('Résultats : foie homogène. Conclusion : examen normal.')
    expect(Array.isArray(structuring.warnings)).toBe(true)
  })
})

describe('4–7. R0 safety regressions survive the unified path', () => {
  it('4. decimal measurements are preserved', () => {
    const { output, structuring } = draft('Résultats : kyste de 3.5 cm du rein droit.')
    expect(`${structuring.cleanedTranscript} ${output.results}`).toContain('3.5 cm')
    expect(output.results).not.toMatch(/de 3\.\s/)
  })

  it('4b. a decimal survives a retraction that replaces it', () => {
    const { output } = draft('Résultats : kyste de 3.5 cm. Non. Kyste de 4.5 cm.')
    expect(output.results).toContain('4.5 cm')
    expect(output.results).not.toContain('Kyste de 3. Kyste de 4. 5 cm.')
  })

  it('5. "correction de scoliose" is legitimate wording, not a correction marker', () => {
    const { output, structuring } = draft('Résultats : patient opéré pour correction de scoliose.')
    expect(output.results).toContain('correction de scoliose')
    expect(structuring.correctionEvents.filter((e) => e.applied !== false)).toHaveLength(0)
  })

  it('6. a question followed by "Non." is preserved, and flagged for review', () => {
    const { output, structuring } = draft(
      'Résultats : anomalie de perfusion ? Non. Parenchyme homogène.',
    )
    expect(output.results).toContain('Parenchyme homogène')
    expect(output.results).toContain('Non.')
    // The engine refused to treat it as a retraction → review suggestion.
    const suggestions = structuring.correctionEvents.filter((e) => e.applied === false)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(structuring.reviewRequired).toBe(true)
  })

  it('6b. laterality and lesion identity survive a localized "ou plutôt"', () => {
    const { output } = draft(
      'Résultats : nodule du lobe supérieur droit mesurant 12 mm, ou plutôt 14 mm.',
    )
    expect(output.results).toContain('lobe supérieur droit')
    expect(output.results).toContain('14 mm')
    expect(output.results).not.toContain('12 mm')
  })

  it('7. repeated Impression/Conclusion aliases retain the final conclusion', () => {
    const { output } = draft(
      'Impression : doute sur une lésion focale. Conclusion : pas de lésion focale décelable.',
    )
    expect(output.conclusion).toContain('pas de lésion focale décelable')
  })

  it('uncertainty hedges are never stripped', () => {
    const { output } = draft('Résultats : nodule probable du lobe supérieur. Conclusion : à confirmer.')
    expect(`${output.results} ${output.conclusion}`).toMatch(/probable/i)
    expect(`${output.results} ${output.conclusion}`).toMatch(/à confirmer/i)
  })

  it('never invents a finding for a section that was not dictated', () => {
    const { output } = draft('Indication : céphalées.')
    expect(output.recommendations ?? '').toBe('')
  })
})

describe('8–9. auto-filled and inferred content stay review-required', () => {
  it('8. the auto-filled TECHNIQUE protocol is flagged autoFilled + reviewRequired', () => {
    // No dictated technique → the engine supplies the standard protocol, which
    // is the only machine-authored text in the pipeline.
    const { output, structuring } = draft('Résultats : pas d’anomalie décelable du parenchyme.')
    const technique = structuring.confidence.find((c) => c.section === 'technique')!
    expect(output.technique.length).toBeGreaterThan(0)
    expect(technique.autoFilled).toBe(true)
    expect(technique.reviewRequired).toBe(true)
    expect(structuring.reviewRequired).toBe(true)
  })

  it('9. an empty/inferred CONCLUSION is review-required', () => {
    const { structuring } = draft('Le foie est homogène.')
    const conclusion = structuring.confidence.find((c) => c.section === 'conclusion')!
    expect(conclusion.reviewRequired).toBe(true)
    expect(structuring.reviewRequired).toBe(true)
  })

  it('a dictated technique is NOT flagged auto-filled', () => {
    const { structuring } = draft(
      'Technique : scanner cérébral hélicoïdal sans injection. Résultats : pas d’anomalie.',
    )
    const technique = structuring.confidence.find((c) => c.section === 'technique')!
    expect(technique.autoFilled).toBeUndefined()
  })
})

describe('10–11. the draft stays compatible with the accept path', () => {
  it('10. output satisfies the StructuredReportData shape acceptHPDDraft persists', () => {
    const { output } = draft('Indication : céphalées. Résultats : normal. Conclusion : normal.')
    for (const key of ['language', 'examType', 'examTitle', 'patient', 'indication', 'technique', 'results', 'conclusion']) {
      expect(output, `missing ${key}`).toHaveProperty(key)
    }
    expect(output.patient).toHaveProperty('name')
    expect(typeof output.results).toBe('string')
  })

  it('11. a finalized report still cannot accept the draft', () => {
    const gate = evaluateReportWrite({
      kind: 'ai_accept', currentStatus: 'finalized', actorRole: 'radiologist',
    })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain('Finalized reports cannot be modified')
  })

  it('11b. a draft report still accepts it', () => {
    expect(evaluateReportWrite({
      kind: 'ai_accept', currentStatus: 'draft', actorRole: 'radiologist',
    }).allowed).toBe(true)
  })
})

describe('12. no external model or network call is introduced', () => {
  it('buildHpdDraft is synchronous — a network call would force it async', () => {
    const value = buildHpdDraft({ rawTranscript: 'Résultats : normal.', ...ctx })
    expect(value).not.toBeInstanceOf(Promise)
    expect(value.output).toBeDefined()
  })

  it('is deterministic — identical input yields identical clinical content', () => {
    const raw = 'Indication : céphalées. Résultats : pas d’anomalie. Conclusion : normal.'
    const a = draft(raw)
    const b = draft(raw)
    expect(b.output.results).toBe(a.output.results)
    expect(b.output.conclusion).toBe(a.output.conclusion)
    expect(b.structuring.cleanedTranscript).toBe(a.structuring.cleanedTranscript)
  })

  it('the module source contains no network primitives', () => {
    const src = readFileSync(new URL('./hpd-draft.ts', import.meta.url), 'utf8')
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'https://', 'openai', 'anthropic']) {
      expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})
