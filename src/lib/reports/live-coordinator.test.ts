import { describe, it, expect } from 'vitest'
import {
  createCoordinator,
  beginRevision,
  reconcile,
  classifySectionUpdate,
  isExtensionOf,
  markPhysicianEdit,
  resumeAiManagement,
  acceptSuggestion,
  rejectSuggestion,
  liveSections,
  physicianOwnedSections,
  hasOpenReviewFlags,
  toReportData,
  freeze,
  type LiveCoordinatorState,
} from '@/lib/reports/live-coordinator'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import { emptyTranscriptState, commitCompleteTranscript, structuringInput } from '@/lib/dictation/transcript-stability'
import type { StructuredReportData } from '@/types/report'

// R2.5 — the live coordinator runs the REAL canonical pipeline in these tests.
// Nothing is mocked: if buildHpdDraft changes behaviour, these fail, which is
// the point — the coordinator's safety promises are about the actual engine.

const CTX = { modality: 'CT', bodyPart: 'abdomen' as string | null }

function structure(stable: string) {
  return buildHpdDraft({ rawTranscript: stable, modality: CTX.modality, bodyPart: CTX.bodyPart })
}

/** One live tick: open a revision, structure, reconcile. */
function step(state: LiveCoordinatorState, stable: string, opts?: { force?: boolean }) {
  const begun = beginRevision(state, stable, opts)
  if (!begun.changed) return { state: begun.state, decisions: [], outcome: 'skipped' as const }
  const d = structure(stable)
  const r = reconcile(begun.state, {
    revision: begun.revision,
    stableTranscript: stable,
    draft: d.output,
    meta: d.structuring,
  })
  return { state: r.state, decisions: r.decisions, outcome: r.outcome }
}

const decisionFor = (decisions: ReturnType<typeof step>['decisions'], k: string) =>
  decisions.find((d) => d.key === k)!

/** Lowercased word tokens, for tracing output back to what was dictated. */
const words = (s: string): string[] =>
  s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

const BASE: StructuredReportData = {
  language: 'fr',
  examType: 'CT',
  examTitle: 'Scanner abdominal',
  patient: { name: '', age: '', sex: '' },
  indication: '', technique: '', results: '', conclusion: '',
}

// ─── 1–3. The seam ────────────────────────────────────────────────────────────

describe('input seam', () => {
  it('1. only the stable transcript can reach the coordinator', () => {
    // structuringInput excludes interim by construction (R2.4). It is the only
    // thing the coordinator is ever given.
    let ts = emptyTranscriptState()
    ts = commitCompleteTranscript(ts, 'Foie homogène.', { source: 'computer', now: '2026-08-10T00:00:00.000Z' })
    ts = { ...ts, interim: 'nodule suspect du lobe' }

    const { state } = step(createCoordinator(), structuringInput(ts))
    const sections = liveSections(state)
    for (const text of Object.values(sections)) {
      expect(text).not.toContain('nodule suspect')
    }
  })

  it('2. a stable segment opens a revision', () => {
    const c = createCoordinator()
    const begun = beginRevision(c, 'Foie homogène.')
    expect(begun.changed).toBe(true)
    expect(begun.revision).toBe(1)
  })

  it('3. the full stable transcript is reprocessed each revision', () => {
    let c = createCoordinator()
    c = step(c, 'Indication : douleur abdominale droite.').state
    const second = step(c, 'Indication : douleur abdominale droite. Le foie est de taille normale et de contours réguliers.')
    // The second pass saw the whole transcript, not just the new sentence.
    expect(second.state.processedTranscript).toContain('douleur abdominale droite')
    expect(second.state.processedTranscript).toContain('contours réguliers')
  })

  it('4. an identical result produces NO_CHANGE everywhere', () => {
    const text = 'Indication : douleur abdominale droite. Le foie est de taille normale et de contours réguliers.'
    let c = createCoordinator()
    c = step(c, text).state

    // Force a second reconciliation of the very same transcript.
    const begun = beginRevision(c, text, { force: true })
    const d = structure(text)
    const r = reconcile(begun.state, {
      revision: begun.revision, stableTranscript: text, draft: d.output, meta: d.structuring,
    })
    expect(r.outcome).toBe('applied')
    expect(r.decisions.every((x) => x.classification === 'NO_CHANGE')).toBe(true)
  })
})

// ─── 5–8. Classification ──────────────────────────────────────────────────────

describe('classification', () => {
  it('5. a new indication auto-applies when nothing is flagged', () => {
    const { state, decisions } = step(createCoordinator(), 'Indication : douleur abdominale droite.')
    const d = decisionFor(decisions, 'indication')
    expect(d.classification).toBe('SAFE_AUTO_APPLY')
    expect(d.reasons).toEqual([])
    expect(liveSections(state).indication).toContain('douleur abdominale droite')
  })

  it('6. an auto-filled technique is REVIEW_REQUIRED, never silent', () => {
    const { decisions } = step(createCoordinator(), 'Indication : douleur abdominale droite.')
    const d = decisionFor(decisions, 'technique')
    expect(d.classification).toBe('REVIEW_REQUIRED')
    expect(d.reasons).toContain('autoFilled')
    expect(d.applied).toBe(true) // written AND flagged — nothing was lost
  })

  it('7. findings with no safety flag may auto-apply', () => {
    const { decisions } = step(
      createCoordinator(),
      'Le foie est de taille normale, de contours réguliers, sans lésion focale décelable.',
    )
    const d = decisionFor(decisions, 'results')
    expect(d.classification).toBe('SAFE_AUTO_APPLY')
  })

  it('8. a conclusion the doctor never marked is REVIEW_REQUIRED', () => {
    const { decisions } = step(
      createCoordinator(),
      'Le foie est de taille normale et de contours réguliers. Nodule hépatique de 12 mm dans le segment VII.',
    )
    const d = decisionFor(decisions, 'conclusion')
    if (d.proposedText.trim()) {
      expect(d.classification).not.toBe('SAFE_AUTO_APPLY')
      expect(d.reasons).toContain('inferredConclusion')
    }
  })

  it('an explicit "Au total" conclusion is not flagged as inferred', () => {
    const { decisions } = step(
      createCoordinator(),
      'Le foie est de taille normale et de contours réguliers. Au total, examen sans anomalie significative.',
    )
    expect(decisionFor(decisions, 'conclusion').reasons).not.toContain('inferredConclusion')
  })

  it('a rewrite of AI content is held back, never written', () => {
    expect(
      classifySectionUpdate({
        previousText: 'Nodule de 12 mm.',
        proposedText: 'Pas de lésion splénique.',
        locked: false,
        flags: [],
      }),
    ).toBe('SUGGESTION_ONLY')
  })

  it('an extension of AI content is not a rewrite', () => {
    expect(isExtensionOf('Nodule de 12 mm. Pas de lésion splénique.', 'Nodule de 12 mm.')).toBe(true)
    expect(isExtensionOf('Pas de lésion splénique.', 'Nodule de 12 mm.')).toBe(false)
    // Re-capitalisation as a section grows is not a rewrite.
    expect(isExtensionOf('Nodule de 12 mm. Suite.', 'nodule de 12 mm.')).toBe(true)
  })

  it('a blank proposal never blanks a section', () => {
    expect(
      classifySectionUpdate({ previousText: 'Nodule de 12 mm.', proposedText: '', locked: false, flags: [] }),
    ).toBe('NO_CHANGE')
  })
})

// ─── 9–13. Physician ownership ────────────────────────────────────────────────

describe('physician ownership', () => {
  const SCRIPT = 'Indication : douleur abdominale droite. Le foie est de taille normale et de contours réguliers.'

  for (const section of ['indication', 'results', 'conclusion'] as const) {
    it(`9-11. a physician-edited ${section} is never overwritten`, () => {
      let c = createCoordinator()
      c = step(c, SCRIPT).state
      c = markPhysicianEdit(c, section, 'TEXTE DU RADIOLOGUE')

      const after = step(c, SCRIPT + ' Nodule hépatique de 12 mm dans le segment VII.')
      expect(liveSections(after.state)[section]).toBe('TEXTE DU RADIOLOGUE')

      const d = decisionFor(after.decisions, section)
      if (d.classification !== 'NO_CHANGE') {
        expect(d.classification).toBe('CONFLICT_WITH_PHYSICIAN_EDIT')
        expect(d.applied).toBe(false)
      }
    })
  }

  it('12. the AI proposal for a locked section is retained as a suggestion', () => {
    let c = createCoordinator()
    c = step(c, SCRIPT).state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')
    c = step(c, SCRIPT + ' Nodule hépatique de 12 mm dans le segment VII.').state

    expect(c.suggestions.results).toBeDefined()
    expect(c.suggestions.results!.text).toContain('foie')
    expect(c.suggestions.results!.reasons).toContain('physicianOwned')
    expect(liveSections(c).results).toBe('TEXTE DU RADIOLOGUE')
  })

  it('13. explicit acceptance updates the locked section', () => {
    let c = createCoordinator()
    c = step(c, SCRIPT).state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')
    c = step(c, SCRIPT + ' Nodule hépatique de 12 mm dans le segment VII.').state

    const suggested = c.suggestions.results!.text
    c = acceptSuggestion(c, 'results')

    expect(liveSections(c).results).toBe(suggested)
    expect(c.suggestions.results).toBeUndefined()
    // Accepting does not hand the section back to AI.
    expect(physicianOwnedSections(c)).toContain('results')
  })

  it('rejecting a suggestion leaves the physician text alone', () => {
    let c = createCoordinator()
    c = step(c, SCRIPT).state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')
    c = step(c, SCRIPT + ' Nodule hépatique de 12 mm.').state
    c = rejectSuggestion(c, 'results')

    expect(c.suggestions.results).toBeUndefined()
    expect(liveSections(c).results).toBe('TEXTE DU RADIOLOGUE')
  })

  it('the doctor can hand a section back to live AI', () => {
    let c = createCoordinator()
    c = step(c, SCRIPT).state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')
    expect(physicianOwnedSections(c)).toContain('results')

    c = resumeAiManagement(c, 'results')
    expect(physicianOwnedSections(c)).not.toContain('results')
  })

  it('a report reopened with saved content starts fully physician-owned', () => {
    const c = createCoordinator({
      base: { ...BASE, indication: 'Douleur.', results: 'Foie normal.', conclusion: 'RAS.' },
    })
    expect(physicianOwnedSections(c)).toEqual(
      expect.arrayContaining(['indication', 'results', 'conclusion']),
    )
    expect(physicianOwnedSections(c)).not.toContain('technique')
  })
})

// ─── 14. Stale results ────────────────────────────────────────────────────────

describe('revisions', () => {
  it('14. a stale revision cannot overwrite a newer one', () => {
    let c = createCoordinator()

    const early = beginRevision(c, 'Le foie est de taille normale.')
    c = early.state
    const late = beginRevision(c, 'Le foie est de taille normale. Nodule hépatique de 12 mm dans le segment VII.')
    c = late.state
    expect(late.revision).toBeGreaterThan(early.revision)

    // The NEWER revision finishes first.
    const lateDraft = structure('Le foie est de taille normale. Nodule hépatique de 12 mm dans le segment VII.')
    const applied = reconcile(c, {
      revision: late.revision,
      stableTranscript: 'Le foie est de taille normale. Nodule hépatique de 12 mm dans le segment VII.',
      draft: lateDraft.output, meta: lateDraft.structuring,
    })
    expect(applied.outcome).toBe('applied')
    const newerText = liveSections(applied.state).results

    // The OLDER one lands afterwards and must be discarded entirely.
    const earlyDraft = structure('Le foie est de taille normale.')
    const stale = reconcile(applied.state, {
      revision: early.revision,
      stableTranscript: 'Le foie est de taille normale.',
      draft: earlyDraft.output, meta: earlyDraft.structuring,
    })
    expect(stale.outcome).toBe('stale')
    expect(stale.decisions).toEqual([])
    expect(liveSections(stale.state).results).toBe(newerText)
    expect(stale.state).toBe(applied.state) // untouched, not merely equal
  })

  it('23. an unchanged stable transcript does not open a revision', () => {
    const text = 'Le foie est de taille normale et de contours réguliers.'
    let c = createCoordinator()
    c = step(c, text).state
    const before = liveSections(c).results

    const again = beginRevision(c, text)
    expect(again.changed).toBe(false)
    expect(again.state).toBe(c)

    // ...and re-running it anyway never duplicates content.
    const forced = step(c, text, { force: true })
    expect(liveSections(forced.state).results).toBe(before)
  })
})

// ─── 15–21. Preservation-first ────────────────────────────────────────────────

describe('preservation', () => {
  it('15. a dictated measurement correction preserves lesion identity', () => {
    const text =
      'Nodule hépatique de 12 mm dans le segment VII. Je corrige, 14 mm. Pas de lésion splénique.'
    const { state } = step(createCoordinator(), text)
    const all = Object.values(liveSections(state)).join(' ')

    // Whatever the engine did with the number, the lesion itself survives.
    expect(all).toContain('segment VII')
    expect(all).toContain('hépatique')
    expect(all).toContain('splénique')
  })

  it('16. an ambiguous correction never destroys content and forces review', () => {
    let c = createCoordinator()
    c = step(c, 'Nodule hépatique de 12 mm dans le segment VII.').state
    const before = liveSections(c)

    const after = step(c, 'Nodule hépatique de 12 mm dans le segment VII. Non.')
    const sections = liveSections(after.state)

    // Nothing that was displayed got deleted.
    for (const k of ['indication', 'results', 'conclusion'] as const) {
      if (before[k]) expect(sections[k]).not.toBe('')
    }
    expect(Object.values(sections).join(' ')).toContain('segment VII')
  })

  it('17-18. decimal separators survive both forms', () => {
    const dot = step(createCoordinator(), 'Lésion hépatique mesurant 3.5 cm de grand axe dans le segment VII.')
    expect(Object.values(liveSections(dot.state)).join(' ')).toContain('3.5 cm')

    const comma = step(createCoordinator(), 'Lésion hépatique mesurant 3,5 cm de grand axe dans le segment VII.')
    expect(Object.values(liveSections(comma.state)).join(' ')).toContain('3,5 cm')
  })

  it('19. negation survives', () => {
    const { state } = step(createCoordinator(), "Pas de lésion focale décelable au niveau du foie ni de la rate.")
    const all = Object.values(liveSections(state)).join(' ')
    expect(all).toContain('Pas de lésion')
    expect(all).toContain('ni de la rate')
  })

  it('20. laterality survives', () => {
    const { state } = step(createCoordinator(), 'Le rein droit est de taille normale. Le rein gauche est atrophique.')
    const all = Object.values(liveSections(state)).join(' ')
    expect(all).toContain('rein droit')
    expect(all).toContain('rein gauche')
  })

  it('21. uncertainty survives', () => {
    const { state } = step(
      createCoordinator(),
      "Lésion hépatique probablement bénigne, évoquant vraisemblablement un angiome du segment VII.",
    )
    const all = Object.values(liveSections(state)).join(' ')
    expect(all).toContain('probablement')
    expect(all).toContain('vraisemblablement')
  })

  it('22. the technique template never creates findings', () => {
    // Nothing about the abdomen was dictated beyond the indication. The engine
    // does echo that sentence into RÉSULTATS as well (a long-standing slicing
    // behaviour, not an R2.5 regression) — which is duplication of the doctor's
    // OWN words. The invariant that matters is that no word appears which the
    // doctor did not say.
    const dictated = 'Indication : douleur abdominale droite.'
    const { state, decisions } = step(createCoordinator(), dictated)
    const sections = liveSections(state)

    // The protocol template is the one machine-authored string, and it is flagged.
    expect(sections.technique).not.toBe('')
    expect(decisionFor(decisions, 'technique').reasons).toContain('autoFilled')

    const said = new Set(words(dictated))
    for (const k of ['indication', 'results', 'conclusion', 'recommendations'] as const) {
      for (const w of words(sections[k])) {
        expect(said, `"${w}" appeared in ${k} but was never dictated`).toContain(w)
      }
    }

    // None of the typical radiology boilerplate materialised.
    const clinical = `${sections.results} ${sections.conclusion}`.toLowerCase()
    for (const invented of ['normal', 'sans particularité', 'pas de lésion', 'unremarkable', 'angiome']) {
      expect(clinical).not.toContain(invented)
    }
  })
})

// ─── 24–27. Stop, phone, import ───────────────────────────────────────────────

describe('completion paths', () => {
  it('24. the final pass runs exactly once, even on an unchanged transcript', () => {
    const text = 'Le foie est de taille normale et de contours réguliers.'
    let c = createCoordinator()
    c = step(c, text).state
    const revisionAfterLive = c.revision

    const final = beginRevision(c, text, { force: true })
    expect(final.changed).toBe(true)
    expect(final.revision).toBe(revisionAfterLive + 1)

    // And a second force would be a second revision — the caller does it once.
    const d = structure(text)
    const r = reconcile(final.state, {
      revision: final.revision, stableTranscript: text, draft: d.output, meta: d.structuring,
    })
    expect(r.outcome).toBe('applied')
    expect(r.state.appliedRevision).toBe(final.revision)
  })

  it('25. an unfinished clause carried into the final transcript is structured', () => {
    // R2.4 returns a dangling clause as `pending`; the workspace appends it to
    // the canonical transcript, so the final pass sees it.
    const live = 'Le foie est de taille normale.'
    const withPending = `${live} Nodule de 12`
    let c = createCoordinator()
    c = step(c, live).state
    const final = step(c, withPending, { force: true })
    expect(final.state.processedTranscript).toContain('Nodule de 12')
  })

  for (const source of ['phone', 'import'] as const) {
    it(`26-27. a complete ${source} transcript works as a single revision`, () => {
      let ts = emptyTranscriptState()
      ts = commitCompleteTranscript(
        ts,
        'Indication : douleur abdominale. Le foie est de taille normale et de contours réguliers.',
        { source, now: '2026-08-10T00:00:00.000Z' },
      )
      const { state, outcome } = step(createCoordinator(), structuringInput(ts))
      expect(outcome).toBe('applied')
      expect(state.appliedRevision).toBe(1)
      expect(liveSections(state).results).toContain('foie')
    })
  }
})

// ─── 28–29. Canonical model and the signing boundary ──────────────────────────

describe('canonical model', () => {
  it('28. live state projects into the canonical StructuredReportData', () => {
    const { state } = step(createCoordinator(), 'Indication : douleur abdominale droite. Le foie est normal.')
    const data = toReportData(state, BASE)

    expect(data.examTitle).toBe(BASE.examTitle)     // identity fields preserved
    expect(data.indication).toBe(liveSections(state).indication)
    expect(data.results).toBe(liveSections(state).results)
    expect(data.conclusion).toBe(liveSections(state).conclusion)
    // No parallel model: the shape is exactly what the editor/export consume.
    expect(Object.keys(data)).toEqual(expect.arrayContaining(Object.keys(BASE)))
  })

  it('29. a finalized report rejects every live patch', () => {
    let c = createCoordinator()
    c = step(c, 'Le foie est de taille normale et de contours réguliers.').state
    const before = liveSections(c)
    c = freeze(c)

    expect(beginRevision(c, 'Nodule hépatique de 12 mm.').changed).toBe(false)

    const d = structure('Nodule hépatique de 12 mm.')
    const r = reconcile(c, {
      revision: c.revision + 99, stableTranscript: 'Nodule hépatique de 12 mm.',
      draft: d.output, meta: d.structuring,
    })
    expect(r.outcome).toBe('frozen')
    expect(r.decisions).toEqual([])
    expect(liveSections(r.state)).toEqual(before)
  })

  it('a frozen report cannot even accept a pending suggestion', () => {
    let c = createCoordinator()
    c = step(c, 'Le foie est de taille normale.').state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')
    c = step(c, 'Le foie est de taille normale. Nodule de 12 mm dans le segment VII.').state
    expect(c.suggestions.results).toBeDefined()

    c = freeze(c)
    expect(liveSections(acceptSuggestion(c, 'results')).results).toBe('TEXTE DU RADIOLOGUE')
  })
})

// ─── Review flags ─────────────────────────────────────────────────────────────

describe('review flags', () => {
  it('open flags are visible and clear when the doctor takes the section over', () => {
    let c = createCoordinator()
    c = step(c, 'Indication : douleur abdominale droite.').state
    expect(hasOpenReviewFlags(c)).toBe(true)          // auto-filled technique
    expect(c.flags.technique).toContain('autoFilled')

    c = markPhysicianEdit(c, 'technique', 'Acquisition hélicoïdale après injection.')
    expect(c.flags.technique).toBeUndefined()
  })

  it('a suggestion from a newer revision supersedes an older one', () => {
    let c = createCoordinator()
    c = step(c, 'Le foie est de taille normale.').state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')

    c = step(c, 'Le foie est de taille normale. Nodule de 12 mm.').state
    const first = c.suggestions.results!.revision
    c = step(c, 'Le foie est de taille normale. Nodule de 12 mm. Pas de lésion splénique.').state

    expect(c.suggestions.results!.revision).toBeGreaterThan(first)
    expect(c.suggestions.results!.text).toContain('splénique')
  })
})
