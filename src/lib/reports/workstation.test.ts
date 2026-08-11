import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { canSignReports, canEditClinicalContent } from '@/lib/safety/authority'
import { evaluateSigningReadiness } from '@/lib/safety/signing-gate'
import { reportDisplayStatus } from '@/lib/reports/display-status'
import { isFrozenRoute } from '@/config/product-scope'
import { visibleNavHrefs } from '@/config/navigation'
import fr from '../../../messages/fr.json'
import en from '../../../messages/en.json'
import type { UserRole } from '@/types/user'
import type { StructuredReportData } from '@/types/report'

// R2.9 — the radiologist workstation.
//
// The six numbered stages (Canevas · Correction · Validation · Prévisualisation
// · Export · Archivage) collapsed into one surface: context → workstation →
// state-dependent actions. These tests protect the CONTRACTS that made that
// safe, not the pixel arrangement.

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const PAGE     = src('app/[locale]/(dashboard)/reports/[id]/page.tsx')
const EDITOR   = src('app/[locale]/(dashboard)/reports/[id]/ReportEditor.tsx')
const HEADER   = src('app/[locale]/(dashboard)/reports/[id]/ReportContextHeader.tsx')
const REVIEW   = src('app/[locale]/(dashboard)/reports/[id]/ReviewSummary.tsx')
const SIGNED   = src('app/[locale]/(dashboard)/reports/[id]/SignedActions.tsx')
const QUEUE    = src('app/[locale]/(dashboard)/reports/page.tsx')
const EXPORTS  = src('app/[locale]/(dashboard)/reports/[id]/ReportExportActions.tsx')

const PAGE_CODE   = strip(PAGE)
const EDITOR_CODE = strip(EDITOR)

// ── Signing authority: the boundary R2.9 must not blur ────────────────────────

describe('only a radiologist may validate and sign', () => {
  it('the authority module is unchanged', () => {
    expect(canSignReports('radiologist')).toBe(true)
    for (const role of ['clinic_admin', 'super_admin', 'secretary', 'technician', 'viewer'] as UserRole[]) {
      expect(canSignReports(role), role).toBe(false)
    }
  })

  it('a clinic admin may still EDIT a draft — write and sign are different rights', () => {
    expect(canEditClinicalContent('clinic_admin')).toBe(true)
    expect(canSignReports('clinic_admin')).toBe(false)
  })

  it('the page derives both rights from the authority module, not inline role arrays', () => {
    expect(PAGE_CODE).toContain('canEditClinicalContent(user.role)')
    expect(PAGE_CODE).toContain('canSignReports(user.role)')
    // The hand-rolled array that used to enable the Sign button for admins.
    expect(PAGE_CODE).not.toMatch(/\[\s*'super_admin',\s*'clinic_admin',\s*'radiologist'\s*\]/)
  })

  it('the Sign action is rendered only when canSign — not merely disabled', () => {
    // Before R2.9 a clinic admin saw an enabled "Valider" that always failed
    // server-side. A control that can never succeed must not be offered.
    expect(EDITOR_CODE).toMatch(/\{canSign && \(/)
    expect(EDITOR_CODE).toContain("value=\"finalize\"")
  })

  it('the editor receives canSign separately from canWrite', () => {
    expect(EDITOR_CODE).toContain('canSign:        boolean')
    expect(PAGE_CODE).toContain('canSign={canSign}')
  })
})

// ── Validation merged beside the action, and it agrees with the server ────────

describe('validation blockers sit beside the signing action', () => {
  it('the editor renders the review summary', () => {
    expect(EDITOR_CODE).toContain('<ReviewSummary')
  })

  it('readiness is computed with the SAME function the server gate uses', () => {
    expect(REVIEW).toContain("from '@/lib/safety/signing-gate'")
    expect(REVIEW).toContain('evaluateSigningReadiness')
    const action = src('lib/actions/reports.ts')
    expect(action).toContain('evaluateSigningReadiness')
  })

  it('the client and the server evaluate the same shape, so they cannot disagree', () => {
    // finalizeReport evaluates the SUBMITTED form content; the editor evaluates
    // the draft that produces that form. Same input, same function, same verdict.
    const draft = {
      language: 'fr', examType: 'ct', examTitle: 'CT',
      patient: { name: 'X', age: '40 ans', sex: 'M' },
      indication: '', technique: 'Scanner sans injection.',
      results: 'Pas d’hémorragie intracrânienne visible ce jour.',
      conclusion: 'Examen cérébral sans anomalie décelable.',
    } as StructuredReportData
    const content = { structuredData: draft, findings: draft.results, impression: draft.conclusion, recommendations: null }

    const blocked = evaluateSigningReadiness({ ...content, aiConfidence: null })
    expect(blocked.canSign).toBe(false)
    expect(blocked.blockers.some((b) => b.section === 'indication')).toBe(true)

    const filled = evaluateSigningReadiness({
      ...content,
      structuredData: { ...draft, indication: 'Céphalées persistantes depuis trois semaines.' },
      aiConfidence: null,
    })
    expect(filled.canSign).toBe(true)
  })

  it('the Sign button is gated on that live readiness', () => {
    expect(EDITOR_CODE).toContain('!readiness.canSign')
  })

  it('review never mutates clinical content', () => {
    for (const forbidden of ['setStructuredDraft', 'setFindings', 'setImpression', 'onChange']) {
      expect(strip(REVIEW), forbidden).not.toContain(forbidden)
    }
  })

  it('the standalone "Validation" stage no longer exists as a separate section', () => {
    expect(PAGE_CODE).not.toContain('SafetyReviewPanel')
    expect(PAGE_CODE).not.toContain('WorkspaceSection')
  })
})

// ── Status vocabulary: one language everywhere ────────────────────────────────

describe('the report page speaks the display vocabulary, like the queue', () => {
  it('the context header uses reportDisplayStatus', () => {
    expect(HEADER).toContain('reportDisplayStatus')
    expect(HEADER).toContain('displayStatusVariant')
  })

  it('no raw internal enum label is rendered any more', () => {
    // "Finalisé" / "En révision" / "Modifié" came from statuses.report.*
    expect(strip(HEADER)).not.toContain('statuses.report')
    expect(PAGE_CODE).not.toMatch(/report\.\$\{report\.status\}/)
    expect(PAGE_CODE).not.toContain('reportStatusVariant')
  })

  it('the same report reads the same on the list and on its own page', () => {
    expect(reportDisplayStatus('amended')).toBe('review_required')
    expect(reportDisplayStatus('finalized')).toBe('signed')
    expect(reportDisplayStatus('finalized', { delivered: true })).toBe('delivered')
    expect(reportDisplayStatus('draft')).toBe('draft')
  })
})

// ── Dead links removed ────────────────────────────────────────────────────────

describe('no link leads somewhere the middleware will not allow', () => {
  it('/studies is frozen, and the report page no longer links to it', () => {
    expect(isFrozenRoute('/studies/abc-123')).toBe(true)
    expect(PAGE_CODE).not.toContain('/studies/')
    expect(strip(HEADER)).not.toContain('/studies/')
  })

  it('the batch-ZIP promise is gone — /reports never offered it', () => {
    expect(PAGE_CODE).not.toContain('archiveBatchLink')
    expect(QUEUE).not.toContain('archiveBatchLink')
    for (const bundle of [fr, en]) {
      expect(Object.keys((bundle as { reports: Record<string, unknown> }).reports))
        .not.toContain('archiveBatchLink')
    }
  })
})

// ── Frozen surfaces are actually frozen ───────────────────────────────────────

describe('runtime matches product-scope.ts', () => {
  it('the frozen explanation/translation panels are off the active report page', () => {
    for (const panel of ['PatientExplanationPanel', 'ReportTranslationPanel', 'ExplanationTranslationPanel']) {
      expect(PAGE_CODE, panel).not.toContain(panel)
    }
  })

  it('their components and backends are NOT deleted — this is surface-only', () => {
    const base = 'app/[locale]/(dashboard)/reports/[id]/'
    for (const panel of ['PatientExplanationPanel', 'ReportTranslationPanel', 'ExplanationTranslationPanel']) {
      expect(existsSync(new URL(`../../${base}${panel}.tsx`, import.meta.url)), panel).toBe(true)
    }
    for (const action of ['lib/actions/explanations.ts', 'lib/actions/translations.ts']) {
      expect(existsSync(new URL(`../../${action}`, import.meta.url)), action).toBe(true)
    }
  })

  it('navigation is still exactly the three clinical items', () => {
    expect(visibleNavHrefs('radiologist')).toEqual(['/reports/new', '/reports', '/templates'])
  })
})

// ── Post-signature: editing recedes, document actions take over ───────────────

describe('a signed report switches to document actions', () => {
  it('the signed region is rendered only when finalized', () => {
    expect(PAGE_CODE).toMatch(/isFinalized && \(\s*<SignedActions/)
  })

  it('it carries preview, export and secure delivery', () => {
    expect(PAGE_CODE).toContain('previewHref="print"')
    expect(PAGE_CODE).toContain('<ReportExportActions')
    expect(PAGE_CODE).toContain('<SecureDeliveryPanel')
    expect(SIGNED).toContain('exportActions')
    expect(SIGNED).toContain('deliveryPanel')
  })

  it('export/delivery are NOT offered before signature', () => {
    // They live inside the isFinalized branch, so an unsigned report shows none.
    const finalizedAt = PAGE_CODE.indexOf('isFinalized && (')
    expect(finalizedAt).toBeGreaterThan(-1)
    expect(PAGE_CODE.indexOf('<ReportExportActions')).toBeGreaterThan(finalizedAt)
    expect(PAGE_CODE.indexOf('<SecureDeliveryPanel')).toBeGreaterThan(finalizedAt)
  })

  it('the pre-signature action block is hidden once signed', () => {
    expect(EDITOR_CODE).toContain('{!isFinalized && (')
  })

  it('signed content stays immutable — amendment remains the only editorial path', () => {
    expect(EDITOR_CODE).toContain('setShowAmendPanel(true)')
    expect(EDITOR_CODE).toContain("value=\"amend\"")
  })
})

// ── Dictation, structuring and special exams preserved ────────────────────────

describe('the clinical workflow itself is untouched', () => {
  const WORKSPACE = src('app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx')

  it('all three dictation methods survive', () => {
    for (const m of ["key: 'computer'", "key: 'phone'", "key: 'import'"]) {
      expect(WORKSPACE, m).toContain(m)
    }
  })

  it('the AI structuring entry point survives', () => {
    expect(WORKSPACE).toContain('structureReportTranscript')
    expect(WORKSPACE).toContain('canStructure(state)')
  })

  it('manual editing survives', () => {
    expect(EDITOR_CODE).toContain('StructuredEditor')
    expect(EDITOR_CODE).toContain('function updateSection')
  })

  it('special structured exams are not flattened', () => {
    expect(EDITOR_CODE).toContain('SpecialFormTableEditor')
    expect(EDITOR_CODE).toContain('missingRequiredRows')
    expect(EDITOR_CODE).toContain('specialIncomplete')
  })

  it('R2.7C correction/provenance semantics are unchanged', () => {
    expect(EDITOR_CODE).toContain('sectionProvenance')
    expect(EDITOR_CODE).toContain("'physician_edit'")
    expect(EDITOR_CODE).toContain('notePhysicianEdit')
    expect(EDITOR_CODE).toContain('withPatient')
  })

  it('the workstation keeps dictation and the document side by side', () => {
    expect(EDITOR_CODE).toMatch(/lg:grid-cols-\[minmax\(0,22rem\)_minmax\(0,1fr\)\]/)
  })
})

// ── Restraint ─────────────────────────────────────────────────────────────────

describe('the workstation is restrained', () => {
  it('no emoji in the report page, editor or export actions', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u
    for (const [name, source] of [
      ['page', PAGE_CODE], ['editor', EDITOR_CODE], ['exports', strip(EXPORTS)],
      ['header', strip(HEADER)], ['signed', strip(SIGNED)],
    ] as const) {
      expect(source, name).not.toMatch(emoji)
    }
  })

  it('provenance metadata is visually subordinate to clinical text', () => {
    const status = strip(src('app/[locale]/(dashboard)/reports/[id]/LiveSectionStatus.tsx'))
    expect(status).toContain('opacity-80')
    // …and still a status, never a control (R2.7C(E)).
    expect(status).toContain('role="status"')
  })

  it('the queue shows exam date AND last activity', () => {
    expect(QUEUE).toContain("t('examDate')")
    expect(QUEUE).toContain('r.study.studyDate')
    expect(QUEUE).toContain('r.updatedAt')
  })

  it('both locales define the new keys', () => {
    for (const [locale, b] of [['fr', fr], ['en', en]] as const) {
      const reports = (b as { reports: Record<string, string> }).reports
      const editor  = (b as { reportEditor: Record<string, string> }).reportEditor
      for (const k of ['examDate', 'signedActionsTitle', 'signedActionsDesc']) {
        expect(reports[k], `${locale}.reports.${k}`).toBeTruthy()
      }
      for (const k of ['signRadiologistOnly', 'signBlockedHint']) {
        expect(editor[k], `${locale}.reportEditor.${k}`).toBeTruthy()
      }
    }
  })
})
