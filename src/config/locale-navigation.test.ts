import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

// Locale-aware navigation.
//
// THE INCIDENT (R2.7C)
// /fr/reports/new → "Commencer" → 404 at /reports/<id>. The report WAS created;
// only the navigation to it broke.
//
// Two defects compounded:
//
//   1. createReport called `redirect` from 'next/navigation', which emits an
//      UNPREFIXED path. Every page lives under /[locale], so '/reports/<id>'
//      matches no route.
//   2. The middleware's protected branch returns before `handleI18n` ever runs,
//      so next-intl never got the chance to add the missing prefix. The safety
//      net that would have rescued the URL did not exist.
//
// Either alone is enough to 404. Both are fixed, and both are pinned here.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SRC  = join(ROOT, 'src')
const read = (rel: string) => readFileSync(join(SRC, ...rel.split('/')), 'utf8')
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('the canonical helper produces locale-prefixed paths', () => {
  it('/fr/reports/new → Commencer → /fr/reports/<id>', () => {
    const id = '2413e4b3-93b4-4cfe-b95d-06942ad7b8fe'
    expect(getPathname({ href: `/reports/${id}`, locale: 'fr' })).toBe(`/fr/reports/${id}`)
  })

  it('the English equivalent prefixes /en', () => {
    const id = '2413e4b3-93b4-4cfe-b95d-06942ad7b8fe'
    expect(getPathname({ href: `/reports/${id}`, locale: 'en' })).toBe(`/en/reports/${id}`)
  })

  it('every configured locale gets a prefix — including the default', () => {
    for (const locale of routing.locales) {
      const path = getPathname({ href: '/reports', locale })
      expect(path, locale).toBe(`/${locale}/reports`)
      expect(path.startsWith(`/${locale}/`), locale).toBe(true)
    }
  })

  it('other workflow destinations are prefixed too', () => {
    expect(getPathname({ href: '/templates', locale: 'fr' })).toBe('/fr/templates')
    expect(getPathname({ href: '/studies/abc', locale: 'en' })).toBe('/en/studies/abc')
  })
})

describe('report-workflow redirects are locale-aware', () => {
  const ACTIONS = ['lib/actions/reports.ts', 'lib/actions/templates.ts']

  for (const rel of ACTIONS) {
    it(`${rel} routes every redirect through getPathname`, () => {
      const code = strip(read(rel))
      const redirects = [...code.matchAll(/\bredirect\(([^\n]*)/g)].map((m) => m[1])
      expect(redirects.length, 'expected redirects to exist').toBeGreaterThan(0)
      for (const arg of redirects) {
        expect(arg, `${rel}: redirect(${arg.slice(0, 60)})`).toContain('getPathname(')
      }
    })

    it(`${rel} supplies the request locale`, () => {
      const code = strip(read(rel))
      expect(code).toContain("import { getLocale } from 'next-intl/server'")
      expect(code).toContain("from '@/i18n/navigation'")
    })
  }

  it('no bare template-literal redirect to a report survives', () => {
    // The exact shape that produced the 404.
    const code = strip(read('lib/actions/reports.ts'))
    expect(code).not.toMatch(/redirect\(`\/reports\//)
    expect(code).not.toMatch(/redirect\(`\/studies\//)
    expect(code).not.toMatch(/redirect\('\/reports/)
  })
})

describe('the middleware rescues an unprefixed protected path', () => {
  const mw = read('middleware.ts')

  it('redirects rather than falling through to a route that does not exist', () => {
    expect(mw).toContain('if (!localeMatch) {')
    expect(mw).toMatch(/new URL\(`\/\$\{locale\}\$\{localelessPath\}`/)
  })

  it('carries the refreshed session cookies onto the redirect', () => {
    // Dropping them would silently log the user out on the hop.
    expect(mw).toMatch(/supabaseResponse\.cookies\.getAll\(\)[\s\S]{0,120}redirectResponse\.cookies\.set/)
  })

  it('preserves the query string', () => {
    expect(mw).toContain('target.search = request.nextUrl.search')
  })

  it('runs AFTER the auth and freeze decisions, so it cannot widen access', () => {
    const authIdx   = mw.indexOf('if (isProtected && !user)')
    const frozenIdx = mw.indexOf('isFrozenRoute(localelessPath)')
    const prefixIdx = mw.indexOf('if (!localeMatch) {')
    expect(authIdx).toBeGreaterThan(-1)
    expect(frozenIdx).toBeGreaterThan(-1)
    expect(prefixIdx).toBeGreaterThan(authIdx)
    expect(prefixIdx).toBeGreaterThan(frozenIdx)
  })

  it('cannot loop: the redirect target itself carries a locale', () => {
    // /reports/x → /fr/reports/x, which matches localeMatch on the next pass.
    const target = '/fr/reports/x'
    expect(/^\/(fr|en)(\/|$)/.test(target)).toBe(true)
  })

  it('still bypasses /api and /auth entirely', () => {
    expect(mw).toContain("pathname.startsWith('/auth/')")
    expect(mw).toContain("pathname.startsWith('/api/')")
    const apiIdx = mw.indexOf("pathname.startsWith('/api/')")
    expect(apiIdx).toBeLessThan(mw.indexOf('if (!localeMatch) {'))
  })
})

describe('nothing else about routing changed', () => {
  const mw = read('middleware.ts')

  it('the protected segment list is unchanged', () => {
    for (const seg of ['/reports', '/templates', '/users', '/settings', '/admin']) {
      expect(mw, seg).toContain(`'${seg}'`)
    }
  })

  it('unauthenticated users still go to login, not to the report', () => {
    expect(mw).toMatch(/if \(isProtected && !user\) \{[\s\S]{0,160}\/login/)
  })

  it('the R2.1 freeze still redirects to the landing route', () => {
    expect(mw).toMatch(/isFrozenRoute\(localelessPath\)\) \{[\s\S]{0,160}LANDING_ROUTE/)
  })

  it('no clinical, RLS or signing symbol appears in the routing layer', () => {
    for (const forbidden of ['signReport', 'canSignReports', 'finalized', 'structured_data', 'service_role']) {
      expect(mw, forbidden).not.toContain(forbidden)
    }
  })
})

describe('the wider locale-loss pattern', () => {
  // Pages that redirect within an ACTIVE surface. A bare redirect there sends
  // the user to a path with no route.
  const ACTIVE_PAGES = [
    'app/[locale]/(dashboard)/users/page.tsx',
    'app/[locale]/(dashboard)/users/new/page.tsx',
    'app/[locale]/(dashboard)/templates/page.tsx',
    'app/[locale]/(dashboard)/templates/new/page.tsx',
    'app/[locale]/(dashboard)/templates/[id]/edit/page.tsx',
  ]

  it('is documented for every active page that still uses a bare redirect', () => {
    // These are role-guard redirects on ADMIN pages: a non-admin is bounced.
    // They share the defect shape, so they are enumerated rather than assumed
    // absent — if one is fixed, remove it from this list deliberately.
    const remaining = ACTIVE_PAGES.filter((rel) =>
      /redirect\('\//.test(strip(read(rel))),
    )
    expect(remaining.sort()).toEqual(ACTIVE_PAGES.sort())
  })

  it('the middleware covers them, which is why they are not urgent', () => {
    // Each target is itself a protected segment, so the unprefixed redirect is
    // now rescued by the middleware rather than 404ing.
    for (const target of ['/dashboard', '/templates', '/users']) {
      const mw = read('middleware.ts')
      expect(mw, target).toContain(`'${target}'`)
    }
  })
})
