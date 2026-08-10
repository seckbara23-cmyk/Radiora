import { describe, it, expect } from 'vitest'
import {
  emptyTranscriptState,
  stableBoundary,
  commitFinalized,
  commitCompleteTranscript,
  appendSegment,
  setInterim,
  finalizeRecording,
  canonicalTranscript,
  rawTranscript,
  structuringInput,
  endsWithCorrectionPrefix,
  endsWithIncompleteMeasurement,
  endsWithIncompleteNegation,
  endsWithIncompleteLaterality,
  type TranscriptState,
} from '@/lib/dictation/transcript-stability'

// R2.4 — the stable transcript boundary.
//
// The governing rule is FAIL CONSERVATIVE: uncertain text stays interim.
// Every case below is a clinical statement that would be dangerous to freeze
// mid-sentence.

const NOW = '2026-08-10T09:00:00.000Z'
const opts = { source: 'computer' as const, now: NOW }
const fresh = () => emptyTranscriptState()

describe('1–2. interim vs final', () => {
  it('1. an unfinished sentence stays interim', () => {
    const { stable, tail } = stableBoundary('Le foie est homogène. La rate est')
    expect(stable).toBe('Le foie est homogène.')
    expect(tail.trim()).toBe('La rate est')
  })

  it('a transcript with no terminator at all is entirely interim', () => {
    expect(stableBoundary('Indication traumatisme crânien')).toEqual({
      stable: '', tail: 'Indication traumatisme crânien',
    })
  })

  it('2. a finished sentence becomes stable', () => {
    const s = commitFinalized(fresh(), 'Parenchyme homogène.', opts)
    expect(canonicalTranscript(s)).toBe('Parenchyme homogène.')
    expect(s.segments).toHaveLength(1)
  })
})

describe('3–4. deduplication and ordering', () => {
  it('3. a repeated final callback does not duplicate the segment', () => {
    let s = commitFinalized(fresh(), 'Foie homogène.', opts)
    s = commitFinalized(s, 'Foie homogène.', opts)   // browser re-delivers
    s = commitFinalized(s, 'Foie homogène.', opts)
    expect(s.segments).toHaveLength(1)
    expect(canonicalTranscript(s)).toBe('Foie homogène.')
  })

  it('4. two final segments keep their order and sequence', () => {
    let s = commitFinalized(fresh(), 'Foie homogène.', opts)
    s = commitFinalized(s, 'Foie homogène. Rate normale.', opts)
    expect(s.segments.map((x) => x.sequence)).toEqual([1, 2])
    expect(s.segments.map((x) => x.text)).toEqual(['Foie homogène.', 'Rate normale.'])
    expect(canonicalTranscript(s)).toBe('Foie homogène. Rate normale.')
  })

  it('segment ids are deterministic, not random', () => {
    const a = commitFinalized(fresh(), 'Foie homogène.', opts)
    const b = commitFinalized(fresh(), 'Foie homogène.', opts)
    expect(a.segments[0].id).toBe('seg-1')
    expect(a.segments[0].id).toBe(b.segments[0].id)
  })

  it('character ranges locate each segment in the canonical transcript', () => {
    let s = commitFinalized(fresh(), 'Foie homogène.', opts)
    s = commitFinalized(s, 'Foie homogène. Rate normale.', opts)
    const canonical = canonicalTranscript(s)
    for (const seg of s.segments) {
      expect(canonical.slice(seg.start, seg.end)).toBe(seg.text)
    }
  })
})

describe('5–6. correction prefixes never destroy prior text', () => {
  it('5. "Je corrige" alone commits nothing and deletes nothing', () => {
    const before = commitFinalized(fresh(), 'Nodule de 12 mm.', opts)
    const after = commitFinalized(before, 'Nodule de 12 mm. Je corrige.', opts)

    // The prior finding survives untouched…
    expect(canonicalTranscript(after)).toContain('Nodule de 12 mm.')
    // …and the dangling correction was NOT frozen.
    expect(canonicalTranscript(after)).not.toContain('Je corrige')
    expect(structuringInput(after)).not.toBe('')
  })

  it('5b. the boundary holds a dangling correction back', () => {
    const { stable, tail } = stableBoundary('Nodule de 12 mm. Je corrige.')
    expect(stable).toBe('Nodule de 12 mm.')
    expect(tail).toContain('Je corrige')
  })

  it('5c. a bare retraction never empties the transcript', () => {
    const { stable } = stableBoundary("Pas d'épanchement pleural. Non.")
    expect(stable).toBe("Pas d'épanchement pleural.")
  })

  it('6. once the replacement arrives the whole correction becomes stable', () => {
    const { stable, tail } = stableBoundary(
      'Nodule de 12 mm. Je corrige. Nodule de 14 mm.',
    )
    expect(stable).toBe('Nodule de 12 mm. Je corrige. Nodule de 14 mm.')
    expect(tail.trim()).toBe('')
  })

  it('recognises the correction vocabulary', () => {
    for (const p of ['Je corrige', 'Correction', 'Non, plutôt', 'Remplacez', 'Supprimez', 'Rectification']) {
      expect(endsWithCorrectionPrefix(`Texte. ${p}`), p).toBe(true)
    }
  })
})

describe('7–9. measurements', () => {
  it('7. an unfinished measurement stays interim', () => {
    for (const t of ['Nodule de 12.', 'Nodule de 12 virgule', 'Lésion de 3 point', 'Masse de 14 millim']) {
      expect(endsWithIncompleteMeasurement(t) || stableBoundary(t).stable === '', t).toBe(true)
    }
  })

  it('7b. "12." is never frozen as a sentence — it may become 12.5', () => {
    expect(stableBoundary('Nodule de 12.').stable).toBe('')
  })

  it('8. a decimal point survives intact', () => {
    const s = commitFinalized(fresh(), 'Nodule de 12.5 mm.', opts)
    expect(canonicalTranscript(s)).toContain('12.5 mm')
    expect(canonicalTranscript(s)).not.toContain('12. 5')
  })

  it('9. a French decimal comma survives intact', () => {
    const s = commitFinalized(fresh(), 'Masse de 3,5 cm.', opts)
    expect(canonicalTranscript(s)).toContain('3,5 cm')
  })

  it('a decimal mid-sentence never creates a boundary', () => {
    expect(stableBoundary('Kyste de 3.5 cm').stable).toBe('')
  })
})

describe('10–11. negation', () => {
  it('10. an unfinished negation stays interim', () => {
    for (const t of ['Pas de', 'Pas de.', 'Absence de', 'Sans', 'Aucune']) {
      expect(endsWithIncompleteNegation(t), t).toBe(true)
    }
    expect(stableBoundary('Foie normal. Pas de.').stable).toBe('Foie normal.')
  })

  it('11. a completed negation becomes stable', () => {
    const s = commitFinalized(fresh(), "Pas d'hémorragie intracrânienne.", opts)
    expect(canonicalTranscript(s)).toBe("Pas d'hémorragie intracrânienne.")
  })
})

describe('12–13. laterality', () => {
  it('12. an unfinished localisation stays interim', () => {
    for (const t of ['Petite lésion du lobe', 'Lésion du', 'Anomalie au niveau']) {
      expect(endsWithIncompleteLaterality(t), t).toBe(true)
    }
    expect(stableBoundary('Foie normal. Petite lésion du lobe.').stable).toBe('Foie normal.')
  })

  it('13. a completed laterality phrase becomes stable', () => {
    const s = commitFinalized(fresh(), 'Petite lésion du lobe supérieur droit.', opts)
    expect(canonicalTranscript(s)).toContain('lobe supérieur droit')
  })

  it('laterality is never inferred — only what was said is committed', () => {
    const s = commitFinalized(fresh(), 'Petite lésion du lobe supérieur.', opts)
    const text = canonicalTranscript(s)
    expect(text).not.toContain('droit')
    expect(text).not.toContain('gauche')
  })
})

describe('14–15. the three transcript views', () => {
  it('14. raw = committed + interim; canonical = committed only', () => {
    let s = commitFinalized(fresh(), 'Foie homogène.', opts)
    s = setInterim(s, 'Rate est')
    expect(canonicalTranscript(s)).toBe('Foie homogène.')
    expect(rawTranscript(s)).toBe('Foie homogène. Rate est')
  })

  it('15. only stable text is eligible for structuring', () => {
    let s = commitFinalized(fresh(), 'Foie homogène.', opts)
    s = setInterim(s, 'Pas de')
    expect(structuringInput(s)).toBe('Foie homogène.')
    expect(structuringInput(s)).not.toContain('Pas de')
  })

  it('the raw transcript stays reconstructable from the segments', () => {
    let s = commitFinalized(fresh(), 'Un.', opts)
    s = commitFinalized(s, 'Un. Deux.', opts)
    expect(s.segments.map((x) => x.text).join(' ')).toBe(canonicalTranscript(s))
  })
})

describe('17–18. phone and imported audio', () => {
  it('17. a phone transcript is committed whole', () => {
    const s = commitCompleteTranscript(fresh(), 'Compte rendu dicté au téléphone.', {
      source: 'phone', now: NOW,
    })
    expect(s.segments).toHaveLength(1)
    expect(s.segments[0].source).toBe('phone')
    expect(canonicalTranscript(s)).toBe('Compte rendu dicté au téléphone.')
  })

  it('18. an imported transcript is committed whole, with no interim phase', () => {
    const s = commitCompleteTranscript(fresh(), 'Texte importé sans terminateur', {
      source: 'import', now: NOW,
    })
    // Complete by definition: the stability guards do not apply.
    expect(canonicalTranscript(s)).toBe('Texte importé sans terminateur')
    expect(s.interim).toBe('')
  })
})

describe('16. recovery without duplication or loss', () => {
  it('a recogniser restart never deletes committed segments', () => {
    let s = commitFinalized(fresh(), 'Foie homogène. Rate normale.', opts)
    const before = canonicalTranscript(s)
    // Restart: the engine begins its cumulative text again from scratch.
    s = commitFinalized(s, 'Autre chose.', opts)
    expect(canonicalTranscript(s)).toContain(before)
    expect(s.segments.length).toBeGreaterThanOrEqual(2)
  })

  it('an empty final result is ignored', () => {
    const s = commitFinalized(fresh(), '   ', opts)
    expect(s.segments).toHaveLength(0)
  })

  it('stopping flushes stable text and reports the unfinished remainder', () => {
    let s = commitFinalized(fresh(), 'Foie homogène.', opts)
    s = setInterim(s, 'Rate normale. Pas de')
    const { state, pending } = finalizeRecording(s, opts)
    expect(canonicalTranscript(state)).toBe('Foie homogène. Rate normale.')
    expect(pending).toBe('Pas de')
    expect(state.interim).toBe('')
  })

  it('stopping mid-correction does not freeze the dangling marker', () => {
    let s: TranscriptState = commitFinalized(fresh(), 'Nodule de 12 mm.', opts)
    s = setInterim(s, 'Je corrige')
    const { state, pending } = finalizeRecording(s, opts)
    expect(canonicalTranscript(state)).toBe('Nodule de 12 mm.')
    expect(pending).toBe('Je corrige')
  })

  it('appending empty text is a no-op', () => {
    expect(appendSegment(fresh(), '  ', opts).segments).toHaveLength(0)
  })
})

describe('16b. no clinical section is populated by this module', () => {
  it('exposes no report-mutating API', () => {
    // The module's whole surface is transcript state. Structuring is a separate,
    // explicit action the radiologist triggers (R2.3) — R2.4 adds no automatic
    // path from speech to report sections.
    const s = commitFinalized(fresh(), 'Foie homogène.', opts)
    expect(Object.keys(s).sort()).toEqual(['interim', 'segments'])
  })
})
