import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  emptyTranscriptState,
  commitFinalized,
  setInterim,
  structuringInput,
  canonicalTranscript,
} from '@/lib/dictation/transcript-stability'
import { splitStableTranscript } from '@/lib/reports/structured-patch'
import { workspaceReducer, canStructure } from '@/lib/reports/workspace-state'

// R2.4 — the invariants that keep live speech away from clinical content.
// These are the properties R2.5 must not regress when it starts consuming the
// stable transcript incrementally.

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

/** Source with comments stripped — rules about CODE, not about prose. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const WORKSPACE = src('app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx')
const STABILITY = code(src('lib/dictation/transcript-stability.ts'))
const HOOK = code(src('lib/hooks/use-speech-recognition.ts'))

const opts = { source: 'computer' as const, now: '2026-08-10T09:00:00.000Z' }

describe('one boundary algorithm', () => {
  it('the R1 helper delegates to the shared engine rather than duplicating it', () => {
    const patch = src('lib/reports/structured-patch.ts')
    expect(patch).toContain('stableBoundary')
    // The old private implementation is gone.
    expect(patch).not.toContain('RETRACTION_TAIL')
  })

  it('both entry points agree', () => {
    const text = 'Foie homogène. Je corrige.'
    expect(splitStableTranscript(text).stable).toBe('Foie homogène.')
  })
})

describe('the speech hook only recognises speech', () => {
  it('never structures', () => {
    expect(HOOK).not.toContain('runStructuring')
    expect(HOOK).not.toContain('buildHpdDraft')
  })

  it('exposes settled and interim text separately', () => {
    expect(HOOK).toContain('finalText')
    expect(HOOK).toContain('interimText')
  })

  it('remains the only Web Speech implementation used by the workspace', () => {
    expect(WORKSPACE).toContain('useSpeechRecognition')
    expect(WORKSPACE).not.toContain('webkitSpeechRecognition')
  })

  it('notifies only when more speech actually settled', () => {
    // An interim-only tick must not re-run the caller's commit reducer.
    expect(HOOK).toMatch(/settledMore\s*=\s*final\s*!==\s*finalRef\.current/)
    expect(HOOK).toMatch(/if \(settledMore\) onFinalTextRef\.current\?\.\(final\)/)
  })
})

describe('the workspace commits on the recognition event, not in an effect', () => {
  it('reduces committed segments from onFinalText', () => {
    expect(WORKSPACE).toContain('onFinalText:')
    // R2.5 — the reducer accumulator moved to a ref so the new canonical text
    // can be emitted in the same event; the commit itself is unchanged.
    expect(WORKSPACE).toContain('commitFinalized(liveRef.current, cumulative')
  })

  it('does not mirror the interim guess into component state', () => {
    // Interim lives in the recogniser hook and is read directly for display.
    expect(WORKSPACE).toContain('speech.interimText.trim()')
    // [^)] already spans newlines — no dotall flag needed (tsconfig target).
    expect(WORKSPACE).not.toMatch(/useEffect\([^)]*setLive/)
  })
})

describe('interim text never becomes clinical content', () => {
  it('structuring input excludes the interim guess', () => {
    let s = commitFinalized(emptyTranscriptState(), 'Foie homogène.', opts)
    s = setInterim(s, 'Pas de lésion du lobe')
    expect(structuringInput(s)).toBe('Foie homogène.')
    expect(structuringInput(s)).not.toContain('lobe')
  })

  it('the workspace structures from the server-side transcript, not the live guess', () => {
    // structureReportTranscript reads the persisted report-owned transcript;
    // the component never passes interim text to a structuring call.
    expect(WORKSPACE).toContain('structureReportTranscript(reportId)')
    expect(WORKSPACE).not.toMatch(/structureReportTranscript\([^)]*interim/i)
  })

  it('structuring stays gated on a complete transcript', () => {
    expect(canStructure('recording')).toBe(false)
    expect(canStructure('transcription_ready')).toBe(true)
    expect(workspaceReducer('recording', { type: 'STRUCTURE' })).toBe('recording')
  })

  it('the stability module cannot mutate a report — it has no such API', () => {
    expect(STABILITY).not.toContain('structured_data')
    expect(STABILITY).not.toContain('supabase')
    expect(STABILITY).not.toContain('runStructuring')
  })

  it('no clinical section is auto-populated in R2.4', () => {
    // onApply is the single path into the editor and it requires a structured
    // draft the radiologist explicitly applies.
    expect(WORKSPACE).toMatch(/function applyDraft/)
    expect(WORKSPACE).toMatch(/if \(!draft\) return/)
  })
})

describe('the stability engine is pure', () => {
  it('has no clock, no randomness and no IO', () => {
    for (const forbidden of ['Date.now', 'new Date(', 'Math.random', 'fetch(', 'localStorage']) {
      expect(STABILITY, forbidden).not.toContain(forbidden)
    }
  })

  it('takes timestamps by injection', () => {
    expect(STABILITY).toContain('now: string')
  })
})

describe('committed text is never lost or duplicated', () => {
  it('survives a mid-dictation guess that changes completely', () => {
    let s = commitFinalized(emptyTranscriptState(), 'Foie homogène.', opts)
    s = setInterim(s, 'Rate')
    s = setInterim(s, 'Rate normale')
    s = setInterim(s, 'Rein droit')
    expect(canonicalTranscript(s)).toBe('Foie homogène.')
    expect(s.segments).toHaveLength(1)
  })

  it('a repeated identical final callback is idempotent', () => {
    let s = emptyTranscriptState()
    for (let i = 0; i < 5; i++) s = commitFinalized(s, 'Foie homogène.', opts)
    expect(s.segments).toHaveLength(1)
  })
})

describe('privacy', () => {
  it('segment metadata carries provenance, not identifiers of people', () => {
    const s = commitFinalized(emptyTranscriptState(), 'Foie homogène.', opts)
    expect(Object.keys(s.segments[0]).sort()).toEqual(
      ['committedAt', 'end', 'id', 'sequence', 'source', 'start', 'text'],
    )
  })

  it('the workspace logs no transcript', () => {
    expect(WORKSPACE).not.toMatch(/console\.(log|info|warn|error)/)
  })
})
