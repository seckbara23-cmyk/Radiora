import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { runStructuring } from '@/lib/ai/structuring-engine'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import { workspaceReducer, canStructure } from '@/lib/reports/workspace-state'
import { stableBoundary } from '@/lib/dictation/transcript-stability'
import {
  createCoordinator, beginRevision, reconcile, liveSections,
} from '@/lib/reports/live-coordinator'

// R2.5 — the wiring invariants. The domain tests prove the coordinator behaves;
// these prove the product is actually plugged into it the way it claims.

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
/** Rules about CODE, not about the prose in comments. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const COORDINATOR = code(read('lib/reports/live-coordinator.ts'))
const HOOK        = code(read('lib/hooks/use-live-structuring.ts'))
const WORKSPACE   = code(read('app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx'))
const EDITOR      = code(read('app/[locale]/(dashboard)/reports/[id]/ReportEditor.tsx'))
const STATUS      = code(read('app/[locale]/(dashboard)/reports/[id]/LiveSectionStatus.tsx'))

describe('1. interim speech has no path into the coordinator', () => {
  it('the workspace emits only the canonical (committed) transcript', () => {
    expect(WORKSPACE).toContain('onStableRef.current?.(canonicalTranscript(next))')
    // The interim guess is displayed, never emitted.
    expect(WORKSPACE).not.toMatch(/onStableRef\.current\?\.\([^)]*interim/i)
    expect(WORKSPACE).not.toMatch(/onStableTranscript\([^)]*interim/i)
  })

  it('the coordinator has no notion of interim text at all', () => {
    expect(COORDINATOR).not.toMatch(/interim/i)
    expect(HOOK).not.toMatch(/interim/i)
  })

  it('the coordinator cannot reach the microphone', () => {
    for (const forbidden of ['useSpeechRecognition', 'SpeechRecognition', 'navigator', 'window']) {
      expect(COORDINATOR, forbidden).not.toContain(forbidden)
    }
  })
})

describe('the domain decides, the component orchestrates', () => {
  it('the coordinator is pure — no React, no IO, no clock', () => {
    for (const forbidden of [
      'useState', 'useEffect', 'react', 'supabase', 'fetch(',
      'Date.now', 'new Date(', 'Math.random', 'localStorage',
    ]) {
      expect(COORDINATOR, forbidden).not.toContain(forbidden)
    }
  })

  it('no classification logic leaked into the components', () => {
    for (const src of [WORKSPACE, EDITOR, STATUS]) {
      expect(src).not.toContain('SAFE_AUTO_APPLY')
      expect(src).not.toContain('classifySectionUpdate')
      expect(src).not.toContain('isExtensionOf')
    }
  })

  it('the editor routes every live write through the coordinator', () => {
    expect(EDITOR).toContain('useLiveStructuring')
    expect(EDITOR).toContain('live.notePhysicianEdit')
    expect(EDITOR).toContain('onStableTranscript=')
  })

  it('a human edit marks the section physician-owned', () => {
    // updateSection is what the textareas call; it always records ownership.
    expect(EDITOR).toMatch(/function updateSection[\s\S]{0,400}live\.notePhysicianEdit/)
  })
})

describe('32. no external model, no network', () => {
  it('nothing in the live path calls out', () => {
    for (const [name, src] of Object.entries({ COORDINATOR, HOOK, WORKSPACE: code(WORKSPACE) })) {
      for (const forbidden of [
        'fetch(', 'XMLHttpRequest', 'WebSocket', 'axios',
        'openai', 'anthropic', 'api.openai', 'gpt-', 'claude-',
      ]) {
        expect(src.toLowerCase(), `${name} / ${forbidden}`).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('structuring is the one canonical engine', () => {
    // The hook runs buildHpdDraft, which runs runStructuring. No second engine.
    expect(HOOK).toContain('buildHpdDraft')
    expect(HOOK).not.toContain('parseStructuredText')
    expect(COORDINATOR).not.toContain('parseStructuredText')
    expect(COORDINATOR).not.toContain('runStructuring')
  })

  it('the engine is synchronous — an external provider would have to change this', () => {
    const result = runStructuring({
      rawTranscript: 'Le foie est normal.', modality: 'CT', bodyPart: 'abdomen',
      patientName: '', patientAge: '', patientSex: '', locale: 'fr',
    })
    expect(result).not.toBeInstanceOf(Promise)
    expect(buildHpdDraft({ rawTranscript: 'Le foie est normal.', modality: 'CT', bodyPart: null }))
      .not.toBeInstanceOf(Promise)
  })
})

describe('19-20 (R2.4 carry-over). the earlier boundaries still hold', () => {
  it('structuring is still unreachable from the recording state', () => {
    expect(canStructure('recording')).toBe(false)
    expect(workspaceReducer('recording', { type: 'STRUCTURE' })).toBe('recording')
    expect(canStructure('transcription_ready')).toBe(true)
  })

  it('the stability boundary still gates what the coordinator ever sees', () => {
    // A dangling retraction is held back, so the coordinator never observes it.
    const { stable, tail } = stableBoundary('Nodule de 12 mm. Je corrige,')
    expect(stable).toBe('Nodule de 12 mm.')
    expect(tail).toContain('Je corrige')

    const c = createCoordinator()
    const begun = beginRevision(c, stable)
    const d = buildHpdDraft({ rawTranscript: stable, modality: 'CT', bodyPart: 'abdomen' })
    const r = reconcile(begun.state, {
      revision: begun.revision, stableTranscript: stable, draft: d.output, meta: d.structuring,
    })
    expect(Object.values(liveSections(r.state)).join(' ')).not.toContain('Je corrige')
  })
})

describe('the signing boundary is untouched', () => {
  it('R2.5 added no signing authority anywhere', () => {
    for (const src of [COORDINATOR, HOOK, STATUS]) {
      for (const forbidden of ['canSignReports', 'signReport', 'finalized', 'signature']) {
        if (forbidden === 'finalized') continue // the hook legitimately reads a frozen flag
        expect(src).not.toContain(forbidden)
      }
    }
  })

  it('a finalized report never reaches live AI in the first place', () => {
    // The workspace only renders while the report is editable, and the hook is
    // frozen from the same condition.
    expect(EDITOR).toContain('frozen: isFinalized')
    expect(EDITOR).toMatch(/isEditable && !hasSpecialForm/)
  })
})

describe('privacy', () => {
  it('no clinical text is logged anywhere in the live path', () => {
    for (const [name, src] of Object.entries({ COORDINATOR, HOOK, WORKSPACE, EDITOR, STATUS })) {
      expect(src, name).not.toMatch(/console\.(log|info|warn|error|debug)/)
    }
  })

  it('the UI shows clinical state, never engine internals', () => {
    for (const forbidden of ['revision', 'confidence', 'parser', 'model', 'Local Engine']) {
      expect(STATUS, forbidden).not.toContain(forbidden)
    }
  })
})
