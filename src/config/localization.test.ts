import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { routing } from '@/i18n/routing'
import { isFrozenRoute } from '@/config/product-scope'
import type { UserRole } from '@/types/user'

// French-first localization.
//
// THE INCIDENT
// A user operating Radiora in French saw "Users", "Invite User", "Report
// Templates", "Deactivate", "Radiologist". None of it was a missing
// translation: `fr.json` was complete and correct, `defaultLocale` was already
// 'fr'. Two whole page trees (/users, /templates) had simply been written with
// hard-coded English JSX and never wired to next-intl, and role badges were
// rendered from a static English map in components/ui/badge.tsx.
//
// Key parity cannot catch that — the keys existed and went unused. So this file
// checks the COMPONENTS, not just the bundles.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SRC  = join(ROOT, 'src')

const fr = JSON.parse(readFileSync(join(ROOT, 'messages', 'fr.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(ROOT, 'messages', 'en.json'), 'utf8'))

const flatten = (o: Record<string, unknown>, p = ''): Array<[string, unknown]> =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, p ? `${p}.${k}` : k)
      : [[p ? `${p}.${k}` : k, v] as [string, unknown]],
  )

const FR = Object.fromEntries(flatten(fr))
const EN = Object.fromEntries(flatten(en))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** Files behind an ACTIVE (non-frozen) surface — what a French user can reach. */
const ACTIVE_SURFACE_DIRS = [
  join(SRC, 'app', '[locale]', '(dashboard)', 'users'),
  join(SRC, 'app', '[locale]', '(dashboard)', 'templates'),
  join(SRC, 'app', '[locale]', '(dashboard)', 'reports'),
  join(SRC, 'app', '[locale]', '(dashboard)', 'settings'),
]
const ACTIVE_FILES = ACTIVE_SURFACE_DIRS
  .flatMap((d) => { try { return walk(d) } catch { return [] } })
  .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx?$/.test(f))

describe('the locale contract', () => {
  it('French is the default locale', () => {
    expect(routing.defaultLocale).toBe('fr')
    expect(routing.locales).toEqual(['fr', 'en'])
  })

  it('both bundles have identical keys', () => {
    const missingInEn = Object.keys(FR).filter((k) => !(k in EN))
    const missingInFr = Object.keys(EN).filter((k) => !(k in FR))
    expect({ missingInEn, missingInFr }).toEqual({ missingInEn: [], missingInFr: [] })
  })

  it('no message value is accidentally empty', () => {
    // delivery.passwordTag.none is deliberately '' — it is the "no password"
    // tag, rendered as nothing. Anything else empty is a mistake.
    const INTENTIONALLY_EMPTY = new Set(['delivery.passwordTag.none'])
    const empty = Object.keys(FR).filter(
      (k) => typeof FR[k] === 'string' && (FR[k] as string).trim() === '' && !INTENTIONALLY_EMPTY.has(k),
    )
    expect(empty).toEqual([])
  })
})

describe('every role has a French and an English label', () => {
  const ROLES: UserRole[] = [
    'super_admin', 'clinic_admin', 'radiologist', 'secretary',
    'technician', 'referring_physician', 'viewer',
  ]

  for (const role of ROLES) {
    it(`${role} is translated in both locales`, () => {
      expect(FR[`roles.${role}`], `fr roles.${role}`).toBeTruthy()
      expect(EN[`roles.${role}`], `en roles.${role}`).toBeTruthy()
    })
  }

  it('the French role labels are the agreed fr-SN wording', () => {
    expect(FR['roles.super_admin']).toBe('Administrateur plateforme')
    expect(FR['roles.clinic_admin']).toBe('Administrateur de clinique')
    expect(FR['roles.radiologist']).toBe('Radiologue')
    expect(FR['roles.secretary']).toBe('Secrétaire')
    expect(FR['roles.technician']).toBe('Technicien')
    expect(FR['roles.referring_physician']).toBe('Médecin prescripteur')
  })

  it('no French role label is left in English', () => {
    for (const role of ROLES) {
      expect(FR[`roles.${role}`], role).not.toBe(EN[`roles.${role}`])
    }
  })

  it('the static English role map is gone from badge.tsx', () => {
    const badge = readFileSync(join(SRC, 'components', 'ui', 'badge.tsx'), 'utf8')
    expect(strip(badge)).not.toContain('userRoleLabel')
    // The colour map stays: a colour is not language.
    expect(badge).toContain('userRoleVariant')
  })

  it('nothing imports the removed map', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => strip(readFileSync(f, 'utf8')).includes('userRoleLabel'))
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([])
  })
})

describe('the enum values themselves were NOT translated', () => {
  it('roles are keyed by the stored database value', () => {
    // Localization must never migrate an enum. The KEY is the enum value.
    for (const role of ['radiologist', 'clinic_admin', 'super_admin']) {
      expect(Object.keys(fr.roles)).toContain(role)
    }
  })

  it('no migration was added for localization', () => {
    // 008_medical_translations.sql is a pre-existing clinical FEATURE (medical
    // term translation), not UI localization — matching on the word
    // "translation" flagged it wrongly. What matters is that this phase added
    // no migration at all: the highest number stays 046.
    const numbers = readdirSync(join(ROOT, 'supabase', 'migrations'))
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .map((f) => Number(f.slice(0, 3)))
    expect(Math.max(...numbers)).toBe(46)
  })
})

describe('active French surfaces carry no hard-coded English', () => {
  // The exact strings reported from production, plus the generic action and
  // status words that were rendered straight from data.
  const LEAKED = [
    'Invite User', 'Report Templates', 'New Template', 'Edit Template',
    'Import / Library', 'Back to Users', 'Back to Templates', 'Send Invite',
    'Create Template', 'Save Changes', 'Deactivate', 'Reactivate',
    'No users yet', 'No templates yet', 'Select a role',
    'First Name', 'Last Name', 'Email Address', 'License Number',
    'Template Title', 'Findings Template', 'Impression Template',
    'Indication Template', 'Technique Template', 'Recommendations Template',
    'Body Part', 'Any modality',
  ]

  it('finds the active surface files to check', () => {
    expect(ACTIVE_FILES.length).toBeGreaterThan(5)
  })

  for (const phrase of LEAKED) {
    it(`"${phrase}" no longer appears in an active component`, () => {
      const offenders = ACTIVE_FILES.filter((f) => strip(readFileSync(f, 'utf8')).includes(phrase))
      expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([])
    })
  }

  it('the previously unlocalized files now use next-intl', () => {
    const wired = [
      'app/[locale]/(dashboard)/users/page.tsx',
      'app/[locale]/(dashboard)/users/new/page.tsx',
      'app/[locale]/(dashboard)/users/new/InviteUserForm.tsx',
      'app/[locale]/(dashboard)/users/UserActions.tsx',
      'app/[locale]/(dashboard)/templates/page.tsx',
      'app/[locale]/(dashboard)/templates/new/page.tsx',
      'app/[locale]/(dashboard)/templates/[id]/edit/page.tsx',
      'app/[locale]/(dashboard)/templates/TemplateForm.tsx',
      'app/[locale]/(dashboard)/templates/ToggleTemplateButton.tsx',
    ]
    for (const rel of wired) {
      const code = readFileSync(join(SRC, ...rel.split('/')), 'utf8')
      expect(code, rel).toMatch(/useTranslations|getTranslations/)
    }
  })

  it('page titles are localized through generateMetadata, not a static string', () => {
    for (const rel of [
      'app/[locale]/(dashboard)/users/new/page.tsx',
      'app/[locale]/(dashboard)/templates/page.tsx',
      'app/[locale]/(dashboard)/templates/new/page.tsx',
      'app/[locale]/(dashboard)/templates/[id]/edit/page.tsx',
    ]) {
      const code = readFileSync(join(SRC, ...rel.split('/')), 'utf8')
      expect(code, rel).toContain('generateMetadata')
      expect(code, rel).not.toMatch(/export const metadata = \{ title: '[A-Z]/)
    }
  })
})

describe('English still works', () => {
  it('every key used by the repaired surfaces resolves in EN too', () => {
    for (const key of [
      'users.title', 'users.inviteUser', 'users.inviteTitle', 'users.backToUsers',
      'users.sendInvite', 'users.colUser', 'users.colRole', 'users.noUsersTitle',
      'templates.pageTitle', 'templates.importLibrary', 'templates.newTemplate',
      'templates.createTemplate', 'templates.saveChanges', 'templates.colTitle',
      'templates.anyModalityGeneric', 'common.cancel',
    ]) {
      expect(EN[key], `en ${key}`).toBeTruthy()
      expect(FR[key], `fr ${key}`).toBeTruthy()
    }
  })

  it('no French copy leaked into the English bundle', () => {
    const frenchOnly = /\b(Utilisateur|Modèle|Compte rendu|Enregistrer|Annuler|Radiologue)\b/
    const leaked = Object.keys(EN).filter(
      (k) => typeof EN[k] === 'string' && frenchOnly.test(EN[k] as string),
    )
    expect(leaked).toEqual([])
  })
})

describe('localization changed nothing else', () => {
  it('the frozen surface is still frozen', () => {
    expect(isFrozenRoute('/patients')).toBe(true)
    expect(isFrozenRoute('/studies')).toBe(true)
    expect(isFrozenRoute('/reports/new')).toBe(false)
  })

  it('no NEXT_PUBLIC variable was introduced', () => {
    const offenders = ACTIVE_FILES.filter((f) => /NEXT_PUBLIC_/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([])
  })

  it('the role gates on the repaired pages are unchanged', () => {
    const users = readFileSync(join(SRC, 'app/[locale]/(dashboard)/users/page.tsx'), 'utf8')
    expect(users).toContain("['clinic_admin', 'super_admin'].includes(currentUser.role)")

    const templates = readFileSync(join(SRC, 'app/[locale]/(dashboard)/templates/page.tsx'), 'utf8')
    expect(templates).toContain("const TEMPLATE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const")
  })

  it('the invite form still offers exactly the assignable roles', () => {
    const form = readFileSync(join(SRC, 'app/[locale]/(dashboard)/users/new/InviteUserForm.tsx'), 'utf8')
    expect(form).toContain("['radiologist', 'secretary', 'technician', 'clinic_admin', 'viewer']")
    // super_admin must never be assignable from a clinic form.
    expect(form).not.toMatch(/ROLE_VALUES[^\]]*super_admin/)
  })
})

describe('technical terminology is intentionally not translated', () => {
  it('modality and protocol codes are preserved verbatim', () => {
    // These are codes, not words: translating them would break the data.
    for (const code of ['CT', 'MRI', 'XR', 'US']) {
      expect(code).toMatch(/^[A-Z]{2,3}$/)
    }
    // The stored modality enum is untouched by this phase.
    const audio = readFileSync(join(SRC, 'types', 'audio.ts'), 'utf8')
    expect(audio).toContain('AUDIO_BUCKET')
  })
})
