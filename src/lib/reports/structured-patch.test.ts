import { describe, it, expect } from 'vitest'
import {
  createLiveReportState,
  fromStructuredReportData,
  toStructuredReportData,
  markSectionEdited,
  unlockSection,
  applyStructuredPatch,
  splitStableTranscript,
} from '@/lib/reports/structured-patch'
import type { StructuredReportPatch } from '@/types/live-structuring'
import type { StructuredReportData } from '@/types/report'

// R1 — the incremental structuring contract.
//
// These pin the safety rules R2 must not regress. The worked example is the one
// from the product brief: a French cranial CT dictated in four turns, where the
// third turn is retracted by "Je corrige" in the fourth.

const BASE: StructuredReportData = {
  language: 'fr',
  examType: 'scanner_cerebral',
  examTitle: 'SCANNER CÉRÉBRAL',
  patient: { name: 'DIOP Mamadou', age: '56 ans', sex: 'Masculin' },
  indication: '',
  technique: '',
  results: '',
  conclusion: '',
}

const patch = (over: Partial<StructuredReportPatch> = {}): StructuredReportPatch => ({
  transcript: '',
  sections: [],
  ...over,
})

describe('live report state', () => {
  it('starts empty with every canonical section present', () => {
    const s = createLiveReportState()
    expect(Object.keys(s.sections).sort()).toEqual(
      ['conclusion', 'indication', 'recommendations', 'results', 'technique'],
    )
    expect(Object.values(s.sections).every((x) => x.text === '' && !x.locked)).toBe(true)
    expect(s.transcript).toBe('')
  })

  it('seeds from an existing report and LOCKS everything already written', () => {
    const s = fromStructuredReportData({
      ...BASE,
      indication: 'Traumatisme crânien.',
      results: 'Petite hyperdensité frontale droite.',
    })
    expect(s.sections.indication.locked).toBe(true)
    expect(s.sections.indication.origin).toBe('radiologist')
    expect(s.sections.results.locked).toBe(true)
    // Empty sections stay open for dictation.
    expect(s.sections.conclusion.locked).toBe(false)
  })
})

describe('incremental dictation — the brief’s worked example', () => {
  it('populates sections turn by turn and corrects without inventing', () => {
    let s = createLiveReportState()

    // T1 — "Indication traumatisme crânien."
    s = applyStructuredPatch(s, patch({
      transcript: 'Indication traumatisme crânien.',
      sections: [{ key: 'indication', text: 'Traumatisme crânien.' }],
    })).state
    expect(s.sections.indication.text).toBe('Traumatisme crânien.')
    expect(s.sections.results.text).toBe('')

    // T2 — "Scanner cérébral sans injection." (protocol boilerplate)
    s = applyStructuredPatch(s, patch({
      transcript: 'Indication traumatisme crânien. Scanner cérébral sans injection.',
      sections: [{
        key: 'technique',
        text: 'Scanner cérébral sans injection de produit de contraste.',
        origin: 'template',
      }],
    })).state
    // Rule 4 — the only machine-authored text always demands confirmation.
    expect(s.sections.technique.origin).toBe('template')
    expect(s.sections.technique.reviewRequired).toBe(true)

    // T3 — "Pas d'hémorragie intracrânienne."
    s = applyStructuredPatch(s, patch({
      transcript: '… Pas d\'hémorragie intracrânienne.',
      sections: [{ key: 'results', text: "Pas d'hémorragie intracrânienne." }],
    })).state
    expect(s.sections.results.text).toBe("Pas d'hémorragie intracrânienne.")

    // T4 — "Je corrige, petite hyperdensité frontale droite."
    const t4 = applyStructuredPatch(s, patch({
      transcript: '… Je corrige, petite hyperdensité frontale droite.',
      sections: [{
        key: 'results',
        text: 'Petite hyperdensité frontale droite.',
        kind: 'correction',
      }],
    }))
    s = t4.state
    expect(s.sections.results.text).toBe('Petite hyperdensité frontale droite.')

    // The correction is traceable: the superseded finding is preserved in the log.
    const corr = t4.entries.find((e) => e.key === 'results')!
    expect(corr.outcome).toBe('applied')
    expect(corr.kind).toBe('correction')
    expect(corr.previousText).toBe("Pas d'hémorragie intracrânienne.")

    // Nothing was invented for sections the doctor never dictated.
    expect(s.sections.recommendations.text).toBe('')

    // And the final projection is the canonical model the exporters already use.
    const sd = toStructuredReportData(s, BASE)
    expect(sd.indication).toBe('Traumatisme crânien.')
    expect(sd.results).toBe('Petite hyperdensité frontale droite.')
    expect(sd.recommendations).toBeUndefined()
    expect(sd.examTitle).toBe('SCANNER CÉRÉBRAL')
  })
})

describe('safety rules', () => {
  it('never blanks a section that already has content', () => {
    let s = createLiveReportState()
    s = applyStructuredPatch(s, patch({
      sections: [{ key: 'results', text: 'Lame pleurale gauche.' }],
    })).state

    // The engine momentarily returns nothing (mid-retraction partial transcript).
    const r = applyStructuredPatch(s, patch({ sections: [{ key: 'results', text: '' }] }))
    expect(r.entries[0].outcome).toBe('skipped_empty')
    expect(r.state.sections.results.text).toBe('Lame pleurale gauche.')
  })

  it('never overwrites a radiologist edit — it offers a suggestion instead', () => {
    let s = createLiveReportState()
    s = applyStructuredPatch(s, patch({
      sections: [{ key: 'conclusion', text: 'Contusion frontale.' }],
    })).state
    s = markSectionEdited(s, 'conclusion', 'Contusion frontale droite, à contrôler.')

    const r = applyStructuredPatch(s, patch({
      sections: [{ key: 'conclusion', text: 'Aspect normal.' }],
    }))
    expect(r.entries[0].outcome).toBe('suggested_locked')
    expect(r.suggestions).toHaveLength(1)
    expect(r.suggestions[0].text).toBe('Aspect normal.')
    // The doctor's words survive untouched.
    expect(r.state.sections.conclusion.text).toBe('Contusion frontale droite, à contrôler.')
  })

  it('an explicit unlock lets structuring propose again', () => {
    let s = createLiveReportState()
    s = markSectionEdited(s, 'results', 'Texte du radiologue.')
    s = unlockSection(s, 'results')
    const r = applyStructuredPatch(s, patch({
      sections: [{ key: 'results', text: 'Nouvelle dictée.' }],
    }))
    expect(r.entries[0].outcome).toBe('applied')
  })

  it('a radiologist edit clears an inherited machine review flag', () => {
    let s = createLiveReportState()
    s = applyStructuredPatch(s, patch({
      sections: [{ key: 'technique', text: 'Protocole standard.', origin: 'template' }],
    })).state
    expect(s.sections.technique.reviewRequired).toBe(true)
    s = markSectionEdited(s, 'technique', 'Scanner sans injection.')
    expect(s.sections.technique.reviewRequired).toBe(false)
  })

  it('the transcript only ever grows, and a regression is flagged not swallowed', () => {
    let s = createLiveReportState()
    s = applyStructuredPatch(s, patch({ transcript: 'Phrase un. Phrase deux.' })).state

    const r = applyStructuredPatch(s, patch({ transcript: 'Phrase un.' }))
    expect(r.transcriptRegressed).toBe(true)
    expect(r.state.transcript).toBe('Phrase un. Phrase deux.')
  })

  it('structuring never rewrites the transcript when it changes a section', () => {
    let s = createLiveReportState()
    const transcript = "Pas d'hémorragie. Je corrige. Hyperdensité frontale."
    s = applyStructuredPatch(s, patch({
      transcript,
      sections: [{ key: 'results', text: 'Hyperdensité frontale.', kind: 'correction' }],
    })).state
    expect(s.transcript).toBe(transcript)
  })

  it('logs every decision so a correction can be traced to what it replaced', () => {
    let s = createLiveReportState()
    s = applyStructuredPatch(s, patch({ sections: [{ key: 'results', text: 'A.' }] })).state
    s = applyStructuredPatch(s, patch({ sections: [{ key: 'results', text: 'B.' }] })).state
    expect(s.log).toHaveLength(2)
    expect(s.log[1].previousText).toBe('A.')
    expect(s.log[1].nextText).toBe('B.')
  })
})

describe('splitStableTranscript — the stability boundary', () => {
  it('holds an unfinished sentence back', () => {
    const { stable, tail } = splitStableTranscript('Le foie est homogène. La rate est')
    expect(stable).toBe('Le foie est homogène.')
    expect(tail).toBe(' La rate est')
  })

  it('never splits a decimal measurement', () => {
    const { stable, tail } = splitStableTranscript('Kyste de 3.5 cm')
    expect(stable).toBe('')
    expect(tail).toBe('Kyste de 3.5 cm')
  })

  it('holds back a retraction whose replacement has not been spoken yet', () => {
    // This is the case that empties the whole report if structured as-is.
    const { stable, tail } = splitStableTranscript("Pas d'épanchement pleural. Non.")
    expect(stable).toBe("Pas d'épanchement pleural.")
    expect(tail.trim()).toBe('Non.')
  })

  it('releases the retraction once its replacement arrives', () => {
    const { stable } = splitStableTranscript(
      "Pas d'épanchement pleural. Non. Fine lame pleurale gauche.",
    )
    expect(stable).toBe("Pas d'épanchement pleural. Non. Fine lame pleurale gauche.")
  })

  it('treats text with no terminator as entirely unstable', () => {
    expect(splitStableTranscript('Indication traumatisme')).toEqual({
      stable: '',
      tail: 'Indication traumatisme',
    })
  })

  it('handles empty input', () => {
    expect(splitStableTranscript('')).toEqual({ stable: '', tail: '' })
  })
})
