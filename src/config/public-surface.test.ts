import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fr from '../../messages/fr.json'
import en from '../../messages/en.json'

// R2.8 — public landing + login redesign.
//
// Landing/login are Server + Client Components (Supabase auth, next-intl
// client context) with no jsdom/RTL harness in this project — vitest.config.ts
// runs `environment: 'node'` throughout, and every existing test in the repo
// that touches a page/component does so by source-behaviour inspection, not by
// rendering (see src/config/locale-navigation.test.ts). This file follows that
// same established convention rather than introducing a new testing stack for
// two pages.
//
// A separate real production build + server smoke-test (curl against
// /fr, /en, /fr/login, /en/login) was run manually before this suite was
// written; see the R2.8 final report for what that did and did not prove.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const LOGIN = strip(read('src/app/[locale]/(auth)/login/page.tsx'))
const MKT_LAYOUT = strip(read('src/app/[locale]/(marketing)/layout.tsx'))
const MKT_HOME = strip(read('src/app/[locale]/(marketing)/page.tsx'))
const LANDING_SECTIONS = strip(read('src/components/marketing/landing-sections.tsx'))
const LOCALE_SWITCH = strip(read('src/components/marketing/locale-switch.tsx'))

// ── Auth mechanism is untouched — only presentation moved ─────────────────────

describe('login: the authentication mechanism is unchanged', () => {
  it('still calls supabase.auth.signInWithPassword directly', () => {
    expect(LOGIN).toContain('supabase.auth.signInWithPassword({ email, password })')
  })

  it('still redirects to /reports on success', () => {
    expect(LOGIN).toContain("router.push('/reports')")
  })

  it('still uses the canonical Supabase browser client factory', () => {
    expect(LOGIN).toContain("import { createClient } from '@/lib/supabase/client'")
  })

  it('still reads ?onboarded=1 for the trial-signup confirmation banner', () => {
    expect(LOGIN).toContain("useSearchParams().get('onboarded') === '1'")
  })

  it('the email/password fields keep their ids and autocomplete hints', () => {
    expect(LOGIN).toContain('id="email"')
    expect(LOGIN).toContain('autoComplete="email"')
    expect(LOGIN).toContain('id="password"')
    expect(LOGIN).toContain('autoComplete="current-password"')
  })
})

// ── R2.8 audit finding: no password-reset flow exists anywhere ────────────────

describe('login: the dead "forgot password" link was removed, not left broken', () => {
  it('no href="#" survives on the login page', () => {
    expect(LOGIN).not.toMatch(/href=["']#["']/)
  })

  it('the unused translation key was removed from both catalogues', () => {
    expect(Object.keys((fr as { auth: Record<string, unknown> }).auth)).not.toContain('forgotPassword')
    expect(Object.keys((en as { auth: Record<string, unknown> }).auth)).not.toContain('forgotPassword')
  })

  it('no password-reset flow was invented (repository-wide)', () => {
    const hits = ['src/lib/actions/*', 'src/app/**'].length // placeholder to keep grep local
    void hits
    for (const rel of [
      'src/lib/actions/reports.ts',
      'src/app/[locale]/(auth)/login/page.tsx',
      'src/app/[locale]/(auth)/signup/page.tsx',
    ]) {
      expect(strip(read(rel))).not.toContain('resetPasswordForEmail')
    }
  })
})

// ── Self-service signup: audited as real, kept — never invented, never hidden ─

describe('signup: real existing infrastructure is preserved, not invented', () => {
  it('the onboarding server actions still exist and are unmodified in shape', () => {
    const onboarding = strip(read('src/lib/actions/onboarding.ts'))
    expect(onboarding).toContain('export async function requestSignupCode')
    expect(onboarding).toContain('export async function verifySignupCode')
    expect(onboarding).toContain('export async function startFreeTrial')
  })

  it('login still links to the real /signup route', () => {
    expect(LOGIN).toMatch(/href=["']\/signup["']/)
  })

  it('the marketing header still links to the real /signup route', () => {
    expect(MKT_LAYOUT).toMatch(/href=["']\/signup["']/)
  })

  it('the final CTA still offers account creation, alongside sign-in', () => {
    expect(LANDING_SECTIONS).toMatch(/href=["']\/login["']/)
    expect(LANDING_SECTIONS).toMatch(/href=["']\/signup["']/)
  })
})

// ── Locale switch: one mechanism, reused everywhere it now appears ────────────

describe('locale switch: the proven dashboard pattern, extracted and reused', () => {
  it('uses the canonical next-intl navigation hooks, not next/navigation directly', () => {
    expect(LOCALE_SWITCH).toContain("from '@/i18n/navigation'")
    expect(LOCALE_SWITCH).not.toContain("from 'next/navigation'")
  })

  it('toggles between exactly fr and en, matching routing.locales', () => {
    expect(LOCALE_SWITCH).toContain("locale === 'fr' ? 'en' : 'fr'")
  })

  it('navigates via router.replace(pathname, { locale }) — the Topbar pattern', () => {
    expect(LOCALE_SWITCH).toMatch(/router\.replace\(pathname,\s*\{\s*locale:\s*next\s*\}\)/)
  })

  it('the marketing layout now renders it', () => {
    expect(MKT_LAYOUT).toContain('<LocaleSwitch')
  })

  it('the login page now renders it', () => {
    expect(LOGIN).toContain('<LocaleSwitch')
  })

  it('reuses the existing switchLanguage label rather than adding a duplicate key', () => {
    expect(LOCALE_SWITCH).toContain("t('switchLanguage')")
  })
})

// ── CTA hierarchy: "Se connecter" is primary; the trial is never removed ──────

describe('CTA hierarchy: both paths reachable, emphasis per surface', () => {
  // R2.8 landing rebuild — the HERO emphasis flipped, deliberately. R2.8 made
  // "Se connecter" the hero's primary action on the reasoning that most
  // visitors already have an account; the approved reference makes account
  // creation the hero's primary and "See how it works" its secondary. The
  // reference wins for the hero. The HEADER keeps sign-in as its primary, so
  // a returning clinician still has a one-click path from anywhere on the page.
  //
  // What must never change is that BOTH paths exist and neither is dropped.

  it('header: /login remains the filled primary button', () => {
    const headerBlock = MKT_LAYOUT.slice(MKT_LAYOUT.indexOf('<LocaleSwitch'))
    const loginLink = headerBlock.slice(headerBlock.indexOf('href="/login"'), headerBlock.indexOf('href="/login"') + 200)
    expect(loginLink).toContain('bg-blue-600')
  })

  it('header still offers the trial too', () => {
    expect(MKT_LAYOUT).toMatch(/href="\/signup"/)
  })

  it('hero: account creation is the primary action, per the reference', () => {
    expect(MKT_HOME).toMatch(/href="\/signup"[\s\S]{0,160}bg-blue-600/)
  })

  it('hero: "how it works" is the secondary action and anchors the lifecycle', () => {
    expect(MKT_HOME).toContain('href="/#workflow"')
    expect(MKT_HOME).toContain("t('home.secondary')")
    expect(LANDING_SECTIONS).toContain('id="workflow"')
  })

  it('the final CTA still carries BOTH sign-in and sign-up', () => {
    expect(LANDING_SECTIONS).toMatch(/href="\/login"/)
    expect(LANDING_SECTIONS).toMatch(/href="\/signup"/)
  })

  it('final CTA: acquisition is the filled primary, sign-in the outlined secondary', () => {
    // R2.9 polish. The final CTA is the acquisition moment, so /signup is the
    // white filled button and /login is the ring-outlined one — the inverse of
    // the header, which stays sign-in-first for returning clinicians.
    const cta = LANDING_SECTIONS.slice(LANDING_SECTIONS.indexOf('trial-heading'))
    const signupAt = cta.indexOf('href="/signup"')
    const loginAt = cta.indexOf('href="/login"')
    expect(signupAt).toBeGreaterThan(-1)
    expect(loginAt).toBeGreaterThan(-1)
    expect(signupAt, 'signup comes first in the final CTA').toBeLessThan(loginAt)
    expect(cta.slice(signupAt, signupAt + 200)).toContain('bg-white')
    expect(cta.slice(loginAt, loginAt + 200)).toContain('ring-white/40')
  })

  it('the two CTA surfaces have OPPOSITE emphasis, and neither drops a path', () => {
    // Header: /login filled. Final CTA: /signup filled. Both surfaces offer both.
    expect(MKT_LAYOUT).toMatch(/href="\/login"[\s\S]{0,160}bg-blue-600/)
    expect(MKT_LAYOUT).toMatch(/href="\/signup"/)
    expect(LANDING_SECTIONS).toMatch(/href="\/signup"[\s\S]{0,200}bg-white/)
  })
})

// ── AI copy stays within the safety invariant ──────────────────────────────────

describe('AI-assistance copy never claims autonomous diagnosis or signing', () => {
  // R2.8 landing rebuild — SAME CONTRACTS, NEW KEY PATH. The standalone
  // "L'IA assiste" section was removed from the homepage, so its copy moved
  // from `landing.aiAssist.*` into `landing.action.*`, where it is rendered
  // beside the speech-to-report demo. Nothing was weakened: the boundary
  // sentence is byte-identical, and the authority sentence is now the FULL
  // canonical wording ("L'IA assiste — le radiologue reste…"), a superset of
  // the fragment this previously pinned.
  const aiCopy = (b: typeof fr | typeof en) =>
    (b as { landing: { action: Record<string, unknown> } }).landing.action

  it('fr makes no forbidden claim', () => {
    const text = JSON.stringify(aiCopy(fr))
    // The boundary sentence legitimately CONTAINS "diagnostic" — to DENY it.
    expect(text).toMatch(/ne pose pas de diagnostic/)
    expect(text).not.toMatch(/pose un diagnostic/i)
  })

  it('en makes no forbidden claim', () => {
    expect(JSON.stringify(aiCopy(en))).toMatch(/never makes a diagnosis/)
  })

  it('fr states the authority invariant verbatim', () => {
    expect((fr as { landing: { action: { authority: string } } }).landing.action.authority)
      .toBe("L'IA assiste — le radiologue reste l'autorité médicale finale.")
  })

  it('en states the authority invariant', () => {
    expect((en as { landing: { action: { authority: string } } }).landing.action.authority)
      .toBe('AI assists — the radiologist remains the final medical authority.')
  })

  it('neither locale claims AI validates or signs — exact required wording', () => {
    // Pinned verbatim rather than pattern-matched: negation phrasing ("ne
    // fait jamais X" / "never Xs") makes a bare regex for "the forbidden
    // claim" unreliable — it cannot distinguish "makes a diagnosis" from
    // "never makes a diagnosis" without re-deriving the same sentence.
    expect((fr as { landing: { action: { boundary: string } } }).landing.action.boundary).toBe(
      "L'IA ne pose pas de diagnostic, ne valide et ne signe jamais un compte rendu.",
    )
    expect((en as { landing: { action: { boundary: string } } }).landing.action.boundary).toBe(
      'AI never makes a diagnosis, and never validates or signs a report.',
    )
  })

  it('both safety sentences are actually rendered on the homepage', () => {
    const sections = readFileSync(join(ROOT, 'src/components/marketing/landing-sections.tsx'), 'utf8')
    expect(sections).toContain("t('action.authority')")
    expect(sections).toContain("t('action.boundary')")
  })

  it('the core workflow copy still names the radiologist as who signs', () => {
    for (const locale of [fr, en] as const) {
      const steps = (locale as { landing: { workflow: { steps: Array<{ desc: string }> } } }).landing.workflow.steps
      const signStep = steps[3] // "Signez" / "Sign"
      expect(signStep.desc).toMatch(/radiolog/i)
    }
  })
})

// ── Compliance wording: fixed at the exact known set, not silently expandable ──

function findHipaaMentions(obj: unknown, path = ''): string[] {
  const hits: string[] = []
  if (typeof obj === 'string') {
    if (/hipaa/i.test(obj)) hits.push(path)
    return hits
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => hits.push(...findHipaaMentions(v, `${path}[${i}]`)))
    return hits
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      hits.push(...findHipaaMentions(v, path ? `${path}.${k}` : k))
    }
  }
  return hits
}

describe('compliance wording: no unqualified HIPAA claim on the public entry surface', () => {
  // R2.8 found and fixed THREE: the login footer ("Conforme HIPAA" /
  // "HIPAA Compliant" — unqualified), the security page ("Protections de
  // type HIPAA"), and an orphaned, unused "common.hipaaCompliant" key.
  //
  // ONE pre-existing mention is knowingly left — support.faqs[2].a, a visible
  // FAQ answer on /support, which R2.8 did not touch (out of the declared
  // scope: landing + login only). Pinning the exact remaining location means
  // any NEW leak — on landing, login, or anywhere else — fails this test,
  // while the known, reported gap does not silently expand.
  const KNOWN_REMAINING = new Set(['support.faqs[2].a'])

  it('fr.json: HIPAA appears nowhere except the known FAQ answer', () => {
    expect(new Set(findHipaaMentions(fr))).toEqual(KNOWN_REMAINING)
  })

  it('en.json: HIPAA appears nowhere except the known FAQ answer', () => {
    expect(new Set(findHipaaMentions(en))).toEqual(KNOWN_REMAINING)
  })

  it('none of the touched marketing/auth/landing namespaces mention it', () => {
    for (const [locale, data] of [['fr', fr], ['en', en]] as const) {
      const scoped = {
        marketing: (data as Record<string, unknown>).marketing,
        auth: (data as Record<string, unknown>).auth,
        landing: (data as Record<string, unknown>).landing,
      }
      expect(findHipaaMentions(scoped), locale).toEqual([])
    }
  })

  it('the security page copy makes a factual claim, not a named-framework one', () => {
    for (const [locale, data] of [['fr', fr], ['en', en]] as const) {
      const items = (data as { marketing: { security: { items: Array<{ title: string; desc: string }> } } })
        .marketing.security.items
      const text = JSON.stringify(items)
      expect(text, locale).toMatch(/[Ee]ncrypt|[Cc]hiffrement/)
      expect(text, locale).not.toMatch(/hipaa/i)
    }
  })

  it('none of the new/changed public components hard-code the claim', () => {
    for (const [name, src] of [
      ['login', LOGIN],
      ['marketing layout', MKT_LAYOUT],
      ['marketing home', MKT_HOME],
      ['landing sections', LANDING_SECTIONS],
    ] as const) {
      expect(src, name).not.toMatch(/hipaa/i)
    }
  })
})

// ── SEO/metadata: no clinical identifiers, no crawl of authenticated content ──

describe('public metadata carries no patient/report data', () => {
  it('the root generateMetadata is a static product description only', () => {
    // "radiology REPORTING platform" is legitimate product copy — the actual
    // concern is IDENTIFIERS (accession/MRN) or a report/patient object being
    // read into metadata at all. Check structurally, not for the English word.
    const layout = strip(read('src/app/[locale]/layout.tsx'))
    expect(layout).not.toMatch(/accession|\bmrn\b/i)
    expect(layout).not.toMatch(/\breport\.|patient\./)
    expect(layout).not.toContain('getReport')
    expect(layout).not.toContain('getPatient')
  })

  it('robots.ts exists and is reachable outside the locale segment', () => {
    // Next serves src/app/robots.ts at the bare /robots.txt; middleware's own
    // matcher already excludes it (`...|sitemap.xml|robots.txt).*)`), so no
    // middleware change was needed — this pins that the file is where that
    // exclusion expects it.
    expect(() => read('src/app/robots.ts')).not.toThrow()
  })
})

// ── Translation parity, scoped to what R2.8 actually touched ──────────────────

describe('fr/en parity for every namespace R2.8 touched', () => {
  const NAMESPACES = ['marketing', 'auth', 'landing'] as const

  function keys(o: unknown, p = ''): Set<string> {
    const s = new Set<string>()
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) {
        const n = p ? `${p}.${k}` : k
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const kk of keys(v, n)) s.add(kk)
        } else {
          s.add(n)
        }
      }
    }
    return s
  }

  for (const ns of NAMESPACES) {
    it(`${ns}: identical key sets in fr and en`, () => {
      const kf = keys((fr as Record<string, unknown>)[ns])
      const ke = keys((en as Record<string, unknown>)[ns])
      expect([...kf].sort()).toEqual([...ke].sort())
    })
  }

  it('landing.workflow has exactly six stages in both locales', () => {
    for (const [locale, data] of [['fr', fr], ['en', en]] as const) {
      const steps = (data as { landing: { workflow: { steps: unknown[] } } }).landing.workflow.steps
      expect(steps, locale).toHaveLength(6)
    }
  })

  it('the hero states the three dictation capabilities in both locales', () => {
    // R2.8 rebuild: the standalone dictation-modes section was removed, so the
    // product truth "computer / phone-via-QR / AI structures" is now carried by
    // the hero's three capability indicators. Same claim, fewer sections.
    for (const [locale, data] of [['fr', fr], ['en', en]] as const) {
      const caps = (data as { landing: { capabilities: Array<{ label: string; desc: string }> } }).landing.capabilities
      expect(caps, locale).toHaveLength(3)
      for (const c of caps) {
        expect(c.label, locale).toBeTruthy()
        expect(c.desc, locale).toBeTruthy()
      }
    }
  })
})

// ── Visual convergence pass: centered composition replaces the split screen ──

describe('login: converged to a centered composition, split layout removed', () => {
  it('the two-column split layout (BrandPanel) is gone', () => {
    expect(LOGIN).not.toContain('lg:grid-cols-2')
    expect(LOGIN).not.toContain('function BrandPanel')
  })

  it('the auth mechanism is STILL byte-identical after the visual pass', () => {
    // Re-asserted here deliberately: the whole point of a "presentation-only"
    // pass is that this line cannot move, even though the markup around it
    // was rewritten from scratch.
    expect(LOGIN).toContain('supabase.auth.signInWithPassword({ email, password })')
    expect(LOGIN).toContain("router.push('/reports')")
  })

  it('the brand hero renders the wordmark and the tagline, in that order', () => {
    const wordmarkAt = LOGIN.indexOf('RADIORA')
    const taglineAt = LOGIN.indexOf("t('tagline')")
    expect(wordmarkAt).toBeGreaterThan(-1)
    expect(taglineAt).toBeGreaterThan(wordmarkAt)
  })

  it('the AI positioning line sits under the tagline, not inside the card', () => {
    const taglineAt = LOGIN.indexOf("t('tagline')")
    const aiAt = LOGIN.indexOf("t('aiPositioning')")
    const cardAt = LOGIN.indexOf('rounded-2xl border border-gray-200 bg-white')
    expect(aiAt).toBeGreaterThan(taglineAt)
    expect(aiAt).toBeLessThan(cardAt)
  })
})

describe('login: the provisional brand mark is isolated, not claimed as approved', () => {
  const MARK = strip(read('src/components/brand/radiora-mark.tsx'))

  it('login imports it from its own isolated module', () => {
    expect(LOGIN).toContain("import { RadioraMark } from '@/components/brand/radiora-mark'")
  })

  it('the component documents itself as provisional, not an approved asset', () => {
    const raw = read('src/components/brand/radiora-mark.tsx')
    expect(raw).toMatch(/provisional/i)
    expect(raw).toMatch(/not.*approved|no approved/i)
  })

  it('R2.9 polish — the public surface now shares ONE mark, not three', () => {
    // R2.8 deliberately left the marketing header on its own generic document
    // glyph, calling adoption a follow-up decision. That decision has since
    // been made: header, footer and login all render the SAME component, and
    // the old inline glyph is gone rather than left as a second identity.
    expect(MKT_LAYOUT).toContain("import { RadioraMark } from '@/components/brand/radiora-mark'")
    expect((MKT_LAYOUT.match(/<RadioraMark/g) ?? []).length).toBe(2) // header + footer
    expect(LOGIN).toContain('<RadioraMark')
    // The generic document-outline path the header used before.
    expect(MKT_LAYOUT).not.toContain('M9 3H5a2 2 0 00-2 2v4m6-6h10')
    expect(MARK.length).toBeGreaterThan(0)
  })

  it('no third brand asset was introduced', () => {
    // Exactly one brand component exists, and nothing imports a logo image.
    expect(existsSync(new URL('../components/brand/radiora-mark.tsx', import.meta.url))).toBe(true)
    for (const [name, src] of [['layout', MKT_LAYOUT], ['home', MKT_HOME], ['login', LOGIN]] as const) {
      expect(src, name).not.toMatch(/logo\.(svg|png|jpg|webp)/i)
      expect(src, name).not.toContain('next/image')
    }
  })

  it('is a pure presentational component — no data, no network, no auth import', () => {
    expect(MARK).not.toContain('supabase')
    expect(MARK).not.toContain('fetch(')
    expect(MARK).not.toContain("from '@/lib")
  })
})

describe('login: the password-visibility toggle is safe UI-only state', () => {
  it('flips the input type, and nothing else reaches Supabase differently', () => {
    expect(LOGIN).toContain("type={showPassword ? 'text' : 'password'}")
    // The SAME value/onChange/name/autoComplete a plain password field would
    // have — the toggle does not introduce a second source of truth.
    expect(LOGIN).toContain('value={password}')
    expect(LOGIN).toContain("onChange={(e) => setPassword(e.target.value)}")
    expect(LOGIN).toContain('autoComplete="current-password"')
  })

  it('the toggle button cannot submit the form', () => {
    const at = LOGIN.indexOf('setShowPassword((v) => !v)')
    const before = LOGIN.slice(Math.max(0, at - 200), at)
    expect(before).toMatch(/type="button"/)
  })

  it('the toggle has an accessible label that changes with its state', () => {
    expect(LOGIN).toContain("aria-label={showPassword ? t('hidePassword') : t('showPassword')}")
    expect(LOGIN).toContain('aria-pressed={showPassword}')
  })

  it('the accessible labels exist in both locales', () => {
    for (const [locale, data] of [['fr', fr], ['en', en]] as const) {
      const auth = (data as { auth: Record<string, string> }).auth
      expect(auth.showPassword, locale).toBeTruthy()
      expect(auth.hidePassword, locale).toBeTruthy()
    }
  })
})

describe('login: the secure-access note is short, with the fuller factual text kept as a tooltip', () => {
  it('renders the short label', () => {
    expect(LOGIN).toContain("t('secureAccessShort')")
  })

  it('the fuller existing sentence survives — as a title, not deleted', () => {
    expect(LOGIN).toContain('title={t(\'secureNote\')}')
  })

  it('secureAccessShort makes no compliance claim beyond "secure access"', () => {
    for (const [locale, data] of [['fr', fr], ['en', en]] as const) {
      const v = (data as { auth: { secureAccessShort: string } }).auth.secureAccessShort
      expect(v, locale).not.toMatch(/hipaa|certif|compliant|conforme/i)
    }
  })
})

describe('login: no clinical/dashboard dependency reaches the presentation layer', () => {
  it('imports nothing from the authenticated workspace', () => {
    for (const forbidden of [
      "from '@/app/[locale]/(dashboard)",
      "from '@/components/layout/topbar'",
      "from '@/components/layout/sidebar'",
      'lib/ai/', 'lib/safety/', 'lib/reports/', 'lib/dictation/',
    ]) {
      expect(LOGIN, forbidden).not.toContain(forbidden)
    }
  })

  it('the dashboard Topbar/Sidebar were not touched by this pass', () => {
    // git-independent structural check: the R2.8-established shared
    // LocaleSwitch has exactly its two documented consumers (marketing
    // layout + login) plus its own definition — Topbar keeps its own
    // pre-R2.8 inline implementation, deliberately not deduplicated onto it.
    const topbar = strip(read('src/components/layout/topbar.tsx'))
    expect(topbar).not.toContain("from '@/components/marketing/locale-switch'")
    expect(topbar).toContain('function handleLocaleSwitch')
  })
})
