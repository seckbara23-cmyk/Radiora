import { describe, it, expect } from 'vitest'
import {
  createCoordinator,
  beginRevision,
  reconcile,
  markPhysicianEdit,
  resumeAiManagement,
  physicianOwnedSections,
  toReportData,
  type LiveCoordinatorState,
} from '@/lib/reports/live-coordinator'
import {
  fromStructuredReportData,
  sectionProvenanceOf,
  toPersistedProvenance,
} from '@/lib/reports/structured-patch'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import type { StructuredReportData } from '@/types/report'

// R2.7C(D) — physician edits outrank AI, ACROSS A RELOAD.
//
// Before R2.7C provenance lived only in memory. A reload re-derived it from
// whether a section was empty, which locked EVERYTHING — safe, but it meant the
// "Modifié par vous" badge appeared on text the engine had written, and the
// doctor could not tell their own words from the machine's.
//
// The reload here is real: state is projected into StructuredReportData exactly
// as the editor saves it, and a brand-new coordinator is built from that value
// exactly as the page does on the next request. Nothing is mocked.

const CTX = { modality: 'CT', bodyPart: 'abdomen' }

const BASE: StructuredReportData = {
  language: 'fr',
  examType: 'CT',
  examTitle: 'Scanner abdominal',
  patient: { name: 'TEST Patient', age: '46 ans', sex: 'Masculin' },
  indication: '', technique: '', results: '', conclusion: '',
}

function step(state: LiveCoordinatorState, stable: string, opts?: { force?: boolean }) {
  const begun = beginRevision(state, stable, opts)
  if (!begun.changed) return { state: begun.state, decisions: [] }
  const d = buildHpdDraft({ rawTranscript: stable, modality: CTX.modality, bodyPart: CTX.bodyPart })
  const r = reconcile(begun.state, {
    revision: begun.revision,
    stableTranscript: stable,
    draft: d.output,
    meta: d.structuring,
  })
  return { state: r.state, decisions: r.decisions }
}

/** Save → reload, through the exact value the editor persists. */
const reload = (state: LiveCoordinatorState) =>
  createCoordinator({ base: toReportData(state, BASE) })

const AI_DICTATION  = 'Résultats : nodule hépatique du segment VII mesurant 14 mm.'
const MORE_DICTATION =
  'Résultats : nodule hépatique du segment VII mesurant 14 mm. Pas de dilatation des voies biliaires.'

describe('manual override survives a reload', () => {
  it('the clinician’s 13 mm is not restored to the AI’s 14 mm by a later run', () => {
    // 1. AI writes 14 mm.
    let c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    expect(c.report.sections.results.text).toContain('14 mm')
    expect(c.report.sections.results.origin).toBe('dictation')

    // 2. The radiologist corrects it to 13 mm.
    c = markPhysicianEdit(c, 'results', 'Nodule hépatique du segment VII mesurant 13 mm.')

    // 3. Saved, then reopened on a later request.
    const saved = toReportData(c, BASE)
    expect(saved.sectionProvenance?.results).toBe('physician_edit')
    let reopened = createCoordinator({ base: saved })

    // 4. Dictation continues and the engine proposes 14 mm again.
    const after = step(reopened, MORE_DICTATION)
    reopened = after.state
    const results = after.decisions.find((d) => d.key === 'results')!

    expect(results.classification).toBe('CONFLICT_WITH_PHYSICIAN_EDIT')
    expect(results.applied).toBe(false)
    expect(reopened.report.sections.results.text).toContain('13 mm')
    expect(reopened.report.sections.results.text).not.toContain('14 mm')

    // The proposal is offered, never written.
    expect(reopened.suggestions.results?.text).toContain('14 mm')
  })

  it('an AI-written section is NOT claimed as the doctor’s after a reload', () => {
    const c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    const reopened = reload(c)

    // This is what "Modifié par vous" is driven by.
    expect(physicianOwnedSections(reopened)).not.toContain('results')
    expect(reopened.report.sections.results.origin).toBe('dictation')
  })

  it('a physician-written section IS claimed as theirs after a reload', () => {
    let c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    c = markPhysicianEdit(c, 'results', 'Nodule hépatique de 13 mm.')
    expect(physicianOwnedSections(reload(c))).toContain('results')
  })

  it('the protocol template is never presented as the doctor’s words', () => {
    const c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    expect(sectionProvenanceOf(c.report).technique).toBe('template')
    expect(physicianOwnedSections(reload(c))).not.toContain('technique')
  })
})

describe('explicit AI restore — « Reprendre la dictée IA »', () => {
  it('hands the section back, and only then may AI write there again', () => {
    let c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    c = markPhysicianEdit(c, 'results', 'Nodule hépatique du segment VII mesurant 13 mm.')
    c = reload(c)
    expect(physicianOwnedSections(c)).toContain('results')

    // The deliberate hand-back.
    c = resumeAiManagement(c, 'results')
    expect(physicianOwnedSections(c)).not.toContain('results')

    const after = step(c, MORE_DICTATION)
    const results = after.decisions.find((d) => d.key === 'results')!
    expect(results.classification).not.toBe('CONFLICT_WITH_PHYSICIAN_EDIT')
  })

  it('the hand-back is the ONLY thing that unlocks a section', () => {
    let c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    c = markPhysicianEdit(c, 'results', 'Nodule hépatique de 13 mm.')
    // Several more revisions, a reload in the middle — still owned throughout.
    c = step(c, MORE_DICTATION).state
    c = reload(c)
    c = step(c, `${MORE_DICTATION} Rate de taille normale.`).state
    expect(physicianOwnedSections(c)).toContain('results')
    expect(c.report.sections.results.text).toBe('Nodule hépatique de 13 mm.')
  })
})

describe('backward compatibility with reports saved before R2.7C', () => {
  it('a report with NO provenance locks every non-empty section, as before', () => {
    // The conservative rule. Guessing "dictation" here would hand pre-existing
    // clinical text back to the engine — the one direction this must not fail in.
    const legacy: StructuredReportData = {
      ...BASE,
      results: 'Nodule hépatique de 13 mm.',
      conclusion: 'Lésion bénigne probable.',
    }
    expect(legacy.sectionProvenance).toBeUndefined()

    const state = fromStructuredReportData(legacy)
    expect(state.sections.results.locked).toBe(true)
    expect(state.sections.conclusion.locked).toBe(true)
    expect(state.sections.results.origin).toBe('radiologist')
    // Empty sections stay open — there is nothing to protect.
    expect(state.sections.indication.locked).toBe(false)
  })

  it('an unknown stored value falls back to the conservative rule', () => {
    const odd = {
      ...BASE,
      results: 'Nodule hépatique de 13 mm.',
      sectionProvenance: { results: 'something_else' },
    } as unknown as StructuredReportData
    const state = fromStructuredReportData(odd)
    expect(state.sections.results.locked).toBe(true)
  })

  it('provenance is only recorded for sections that hold text', () => {
    const state = fromStructuredReportData({ ...BASE, results: 'Foie homogène.' })
    const map = sectionProvenanceOf(state)
    expect(Object.keys(map)).toEqual(['results'])
  })
})

describe('the two provenance vocabularies map cleanly', () => {
  it('every live origin has exactly one persisted form', () => {
    expect(toPersistedProvenance('radiologist')).toBe('physician_edit')
    expect(toPersistedProvenance('dictation')).toBe('dictation')
    expect(toPersistedProvenance('template')).toBe('template')
  })

  it('a round trip through the persisted form preserves ownership', () => {
    let c = step(createCoordinator({ base: BASE }), AI_DICTATION).state
    c = markPhysicianEdit(c, 'conclusion', 'Lésion bénigne probable.')
    const owned = physicianOwnedSections(c)
    expect(physicianOwnedSections(reload(c)).sort()).toEqual(owned.sort())
  })
})
