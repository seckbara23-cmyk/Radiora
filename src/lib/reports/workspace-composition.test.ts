import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluateReportWrite, isReportContentLocked } from '@/lib/safety/immutability'
import { canSignReports } from '@/lib/safety/authority'
import { visibleNavHrefs } from '@/config/navigation'
import { isFrozenRoute, isNeverRedirected } from '@/config/product-scope'
import type { UserRole } from '@/types/user'

// R2.3 — the unified New Report workspace.
//
// The workspace is a client component driving server actions, so the runtime
// behaviour lives in the state machine (workspace-state.test.ts), the ownership
// contract (dictation/owner.test.ts) and the SQL verification. What is asserted
// here is COMPOSITION: that the workspace reuses the audited infrastructure
// instead of forking it, and that no forbidden terminology or unsafe path crept
// into the doctor-facing surface.

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const WORKSPACE = src('app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx')
const EDITOR    = src('app/[locale]/(dashboard)/reports/[id]/ReportEditor.tsx')
const ACTIONS   = src('lib/actions/report-dictation.ts')

/** Source with comments removed — for rules about CODE, not about prose. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const WORKSPACE_CODE = code(WORKSPACE)

describe('one workflow, three methods', () => {
  it('offers exactly computer / phone / import', () => {
    expect(WORKSPACE).toContain("key: 'computer'")
    expect(WORKSPACE).toContain("key: 'phone'")
    expect(WORKSPACE).toContain("key: 'import'")
  })

  it('asks one clinical question rather than naming technical modules', () => {
    expect(WORKSPACE).toContain("t('question')")
  })

  it('all three methods feed the same report-owned transcript', () => {
    expect(WORKSPACE).toContain('saveReportTranscript')
    expect(WORKSPACE).toContain('importReportAudio')
    expect(WORKSPACE).toContain('createReportDictationSession')
    expect(WORKSPACE).toContain('structureReportTranscript')
  })
})

describe('no duplicate systems were built', () => {
  it('reuses the single browser speech binding — no third implementation', () => {
    expect(WORKSPACE).toContain('useSpeechRecognition')
    expect(WORKSPACE).not.toContain('webkitSpeechRecognition')
    expect(WORKSPACE).not.toContain('new SR(')
  })

  it('reuses the canonical structuring pipeline', () => {
    expect(ACTIONS).toContain('buildHpdDraft')
    expect(ACTIONS).not.toContain('parseStructuredText')
  })

  it('reuses the existing StructuredEditor for the report itself', () => {
    expect(EDITOR).toContain('StructuredEditor')
    // The workspace renders dictation, never its own report editor.
    expect(WORKSPACE).not.toContain('StructuredEditor')
  })

  it('the three technical panels are gone from the report editor', () => {
    for (const gone of ['VoiceDictationPanel', 'LiveDictationPanel', 'SmartStructuringPanel']) {
      expect(EDITOR, gone).not.toContain(gone)
    }
    expect(EDITOR).toContain('DictationWorkspace')
  })

  it('creates no report, patient or study of its own', () => {
    // createReportDictationSession is fine — it mints a pairing session, not a
    // report. What must be absent is any creation CALL.
    expect(WORKSPACE_CODE).not.toMatch(/\bcreateReport\s*\(/)
    expect(WORKSPACE_CODE).not.toMatch(/\bcreatePatient\s*\(/)
    expect(WORKSPACE_CODE).not.toMatch(/\bcreateStudy\s*\(/)
  })
})

describe('forbidden product terminology', () => {
  const forbidden = [
    'Local Engine', 'Vacation Queue', 'Classic recording', 'Classic Recording',
    'OpenAI', 'Anthropic', 'GPT',
  ]

  it('never appears in workspace code or markup', () => {
    // Comments may legitimately name what this replaced; the product surface
    // may not. Scan the code, not the prose.
    for (const term of forbidden) {
      expect(WORKSPACE_CODE.toLowerCase(), term).not.toContain(term.toLowerCase())
    }
  })

  it('the doctor-facing copy carries no provider or engine names', () => {
    const fr = readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8')
    const en = readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8')
    for (const bundle of [fr, en]) {
      const ws = JSON.parse(bundle).workspace
      const copy = JSON.stringify(ws).toLowerCase()
      for (const term of ['local engine', 'openai', 'anthropic', 'gpt', 'vacation']) {
        expect(copy, term).not.toContain(term)
      }
    }
  })
})

describe('interim speech never mutates clinical sections', () => {
  it('structuring is only invoked behind canStructure', () => {
    expect(WORKSPACE).toContain('canStructure(state)')
  })

  it('the live transcript is displayed, never applied automatically', () => {
    // onApply is called only from applyDraft, which requires a structured draft.
    expect(WORKSPACE).toContain('function applyDraft')
    expect(WORKSPACE).toMatch(/if \(!draft\) return\s*\n\s*onApply\(draft\)/)
  })

  it('tells the doctor that interim text is not written to the report', () => {
    expect(WORKSPACE).toContain("t('interimNote')")
  })

  it('introduces no network or model call', () => {
    for (const term of ['fetch(', 'XMLHttpRequest', 'https://', 'WebSocket']) {
      expect(WORKSPACE, term).not.toContain(term)
    }
  })
})

describe('finalized reports stay immutable', () => {
  it('a signed report rejects new dictation', () => {
    expect(isReportContentLocked('finalized')).toBe(true)
    expect(ACTIONS).toContain('isReportContentLocked')
  })

  it('draft and amended reports accept dictation', () => {
    expect(isReportContentLocked('draft')).toBe(false)
    expect(isReportContentLocked('amended')).toBe(false)
  })

  it('the accept gate agrees with the dictation gate', () => {
    expect(evaluateReportWrite({
      kind: 'ai_accept', currentStatus: 'finalized', actorRole: 'radiologist',
    }).allowed).toBe(false)
  })
})

describe('R0.8 signing authority is unchanged', () => {
  it('only a radiologist may sign', () => {
    expect(canSignReports('radiologist')).toBe(true)
    expect(canSignReports('clinic_admin')).toBe(false)
    expect(canSignReports('super_admin')).toBe(false)
    for (const role of ['secretary', 'technician', 'viewer'] as UserRole[]) {
      expect(canSignReports(role), role).toBe(false)
    }
  })

  it('the workspace does not implement its own signing', () => {
    expect(WORKSPACE).not.toContain('finalizeReport')
  })
})

describe('R2.1 surface and public routes are unaffected', () => {
  it('radiologist navigation is still the three core items', () => {
    expect(visibleNavHrefs('radiologist')).toEqual(['/reports/new', '/reports', '/templates'])
  })

  it('the New Report route is reachable', () => {
    expect(isFrozenRoute('/reports/new')).toBe(false)
  })

  it('QR, delivery and print routes remain un-redirected', () => {
    for (const route of ['/m/token', '/r/token', '/reports/abc/print', '/api/reports/abc/pdf']) {
      expect(isFrozenRoute(route), route).toBe(false)
      expect(isNeverRedirected(route), route).toBe(true)
    }
  })
})

describe('privacy in the workspace', () => {
  it('audits owner and method, never transcript bodies or tokens', () => {
    const blocks = [...ACTIONS.matchAll(/metadata:\s*\{[^}]*\}/g)].map((m) => m[0])
    expect(blocks.length).toBeGreaterThan(0)
    for (const b of blocks) {
      expect(b, b).not.toMatch(/\b(rawText|raw_text|corrected_text|cleaned_text)\b(?!\.length)/)
      expect(b, b).not.toMatch(/\btoken\b/i)
    }
  })

  it('does not render database identifiers to the doctor', () => {
    expect(WORKSPACE).not.toMatch(/\{\s*reportId\s*\}/)
    expect(WORKSPACE).not.toMatch(/\{\s*qr\.sessionId\s*\}/)
  })
})
