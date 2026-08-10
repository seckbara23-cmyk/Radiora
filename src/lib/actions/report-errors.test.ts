import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateReportWrite } from '@/lib/safety/immutability'
import { canSignReports } from '@/lib/safety/authority'
import fr from '../../../messages/fr.json'
import en from '../../../messages/en.json'

// R2.7C(G) — the report workspace speaks the doctor's language, and the
// authorization behind it is untouched.
//
// PRODUCTION: /fr displayed "Only a radiologist can validate and sign reports."
// The refusal was CORRECT. A clinic administrator must not gain signing
// authority to make a test pass, so the repair is strictly about the message.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

type Catalogue = Record<string, Record<string, string>>
const FR = (fr as unknown as Catalogue).reportErrors
const EN = (en as unknown as Catalogue).reportErrors

describe('the clinical authority itself is unchanged', () => {
  it('a clinic admin still cannot validate or sign', () => {
    expect(canSignReports('clinic_admin')).toBe(false)
    const check = evaluateReportWrite({
      kind: 'finalize', currentStatus: 'draft', actorRole: 'clinic_admin',
    })
    expect(check.allowed).toBe(false)
    expect(check.code).toBe('radiologist_only_sign')
  })

  it('a super admin still cannot validate or sign', () => {
    expect(canSignReports('super_admin')).toBe(false)
    expect(evaluateReportWrite({
      kind: 'finalize', currentStatus: 'draft', actorRole: 'super_admin',
    }).allowed).toBe(false)
  })

  it('a secretary still cannot validate or sign', () => {
    expect(evaluateReportWrite({
      kind: 'finalize', currentStatus: 'draft', actorRole: 'secretary',
    }).code).toBe('radiologist_only_sign')
  })

  it('a radiologist still can', () => {
    expect(canSignReports('radiologist')).toBe(true)
    expect(evaluateReportWrite({
      kind: 'finalize', currentStatus: 'draft', actorRole: 'radiologist',
    }).allowed).toBe(true)
  })

  it('a finalized report is still immutable outside the amendment flow', () => {
    const check = evaluateReportWrite({
      kind: 'draft_save', currentStatus: 'finalized', actorRole: 'radiologist',
    })
    expect(check.allowed).toBe(false)
    expect(check.code).toBe('finalized_immutable')
  })

  it('every refusal carries a code the action can localize', () => {
    const kinds = ['draft_save', 'ai_accept', 'structuring_accept', 'finalize', 'amend'] as const
    const roles = ['radiologist', 'clinic_admin', 'super_admin', 'secretary'] as const
    const statuses = [null, 'draft', 'in_review', 'finalized', 'amended']
    for (const kind of kinds) {
      for (const actorRole of roles) {
        for (const currentStatus of statuses) {
          const check = evaluateReportWrite({ kind, currentStatus, actorRole })
          if (check.allowed) continue
          expect(check.code, `${kind}/${actorRole}/${currentStatus}`).toBeTruthy()
          expect(check.reason, `${kind}/${actorRole}/${currentStatus}`).toBeTruthy()
        }
      }
    }
  })
})

describe('the message the doctor sees', () => {
  it('/fr gets the exact French wording', () => {
    expect(FR.radiologistOnlySign).toBe('Seul un radiologue peut valider et signer les comptes rendus.')
  })

  it('/en gets the English equivalent', () => {
    expect(EN.radiologistOnlySign).toBe('Only a radiologist can validate and sign reports.')
  })

  it('every denial code has a message in BOTH locales', () => {
    const src = read('src/lib/actions/report-messages.ts')
    const keys = [...src.matchAll(/:\s*'([a-zA-Z]+)',?\s*$/gm)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(10)
    for (const key of new Set(keys)) {
      expect(FR[key], `fr.reportErrors.${key}`).toBeTruthy()
      expect(EN[key], `en.reportErrors.${key}`).toBeTruthy()
    }
  })

  it('the French catalogue contains no English leftovers', () => {
    for (const [key, value] of Object.entries(FR)) {
      expect(value, key).not.toMatch(/\b(?:report|permission|radiologist|finalized|missing|reason)\b/i)
    }
  })

  it('fr and en declare the same keys', () => {
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort())
  })
})

describe('the action layer no longer hard-codes clinician-facing English', () => {
  const code = read('src/lib/actions/reports.ts')

  it('reports.ts routes its errors through the localizer', () => {
    expect(code).toContain("from '@/lib/actions/report-messages'")
    expect(code).not.toContain("'Only a radiologist can validate and sign reports.'")
    expect(code).not.toContain("'You do not have permission to")
    expect(code).not.toContain("'Report not found.'")
    // The raw `reason` string is never returned to the UI any more.
    expect(code).not.toMatch(/return \{ error: gate\.reason \}/)
  })

  it('the signing predicate is still called directly, not via a message', () => {
    expect(code).toContain('canSignReports(user.role)')
  })

  it('the safety module stays pure — no i18n inside a clinical predicate', () => {
    // Comments are stripped first: this module EXPLAINS the localization split
    // in prose, and a scan that matched its own commentary would be worthless.
    const safety = read('src/lib/safety/immutability.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    expect(safety).not.toContain('next-intl')
    expect(safety).not.toContain('getTranslations')
    expect(safety).not.toContain('await ')
    expect(safety).not.toContain('async ')
  })

  it('the remaining English surface is written down, not assumed absent', () => {
    // R2.7C repaired the report WORKSPACE only, as scoped. These actions still
    // return English and are listed so the gap is deliberate and visible.
    const outstanding = ['src/lib/actions/report-dictation.ts', 'src/lib/actions/transcription.ts']
    for (const rel of outstanding) {
      expect(read(rel), rel).toMatch(/return \{ error: '[A-Z]/)
    }
  })
})
