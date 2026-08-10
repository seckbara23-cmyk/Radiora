import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'
// isFrozenRoute() already applies the never-redirect allowlist internally, so
// the allowlist is not imported separately here.
import { isFrozenRoute, LANDING_ROUTE } from '@/config/product-scope'

const handleI18n = createIntlMiddleware(routing)

// Dashboard-app paths that require an authenticated session (locale-stripped).
// Frozen segments stay listed: they must still require a session, because an
// unauthenticated visitor should reach /login rather than be bounced to the
// landing page. R2.1 freezes the product SURFACE, not authentication.
const PROTECTED_SEGMENTS = [
  '/dashboard',
  '/patients',
  '/studies',
  '/reports',
  '/settings',
  '/users',
  '/admin',
  '/audit',
  '/templates',
  '/analytics',
  '/critical-queue',
  '/vacations',
  '/secretary',
  '/feedback',
  '/pilot',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Route handlers under src/app/auth/ (e.g. /auth/logout) are NOT under the
  // [locale] segment. If we let createIntlMiddleware see them it will 307-redirect
  // POST /auth/logout to /en/auth/logout which has no handler → 404.
  // Bypass i18n and Supabase middleware entirely for these paths.
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // API route handlers (e.g. /api/reports/:id/pdf, /api/vacations/export) are not
  // under [locale]. Letting createIntlMiddleware see them would redirect to
  // /fr/api/... (no handler → 404). They enforce their own auth via
  // requireCurrentUser(). Bypass i18n entirely.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Skip auth entirely when Supabase env vars are absent (CI, local no-env).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return handleI18n(request)
  }

  // Determine the locale and the locale-stripped path.
  // e.g. /fr/dashboard → locale='fr', localelessPath='/dashboard'
  //      /dashboard    → locale='fr' (default), localelessPath='/dashboard'
  const localeMatch = pathname.match(/^\/(fr|en)(\/|$)/)
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale
  const localelessPath = localeMatch
    ? pathname.slice(locale.length + 1) || '/'
    : pathname

  const isProtected = PROTECTED_SEGMENTS.some((p) => localelessPath.startsWith(p))
  const isLoginPage = localelessPath === '/login' || localelessPath.startsWith('/login/')

  if (isProtected || isLoginPage) {
    let user: Awaited<ReturnType<typeof updateSession>>['user'] = null
    let supabaseResponse: NextResponse = NextResponse.next({ request })

    try {
      const result = await updateSession(request)
      supabaseResponse = result.supabaseResponse
      user = result.user
    } catch {
      // Supabase unavailable — fall through to i18n handling.
      return handleI18n(request)
    }

    // Unauthenticated → redirect to /{locale}/login.
    if (isProtected && !user) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url), { status: 303 })
    }

    // Already authenticated → skip the login page, land on Reports.
    if (isLoginPage && user) {
      return NextResponse.redirect(new URL(`/${locale}${LANDING_ROUTE}`, request.url), { status: 303 })
    }

    // R2.1 — product-surface freeze. An authenticated user who lands on a
    // frozen module is sent to Reports. The pages, actions and data behind
    // those routes are untouched; only the surface is closed.
    //
    // isFrozenRoute() is the single decision point (src/config/product-scope.ts)
    // and it returns false for everything in the never-redirect allowlist —
    // /api, /auth, public delivery /r/, mobile dictation /m/, print and every
    // /reports/* path — so no loop is possible: the target is itself CORE.
    if (user && isFrozenRoute(localelessPath)) {
      return NextResponse.redirect(new URL(`/${locale}${LANDING_ROUTE}`, request.url), { status: 307 })
    }

    // A protected path that arrived WITHOUT a locale prefix would fall through
    // to the App Router, where nothing is routed at '/reports/<id>' — every
    // page lives under /[locale] — and 404. This branch returns before
    // `handleI18n` ever runs, so next-intl never got the chance to add the
    // prefix; the R2.7C "Commencer → 404" defect surfaced exactly here.
    //
    // The auth and freeze checks above have already run, so this only decides
    // WHERE an allowed request goes, never WHETHER it is allowed. The session
    // cookies refreshed by updateSession are copied onto the redirect so the
    // round trip does not drop them.
    if (!localeMatch) {
      const target = new URL(`/${locale}${localelessPath}`, request.url)
      target.search = request.nextUrl.search
      const redirectResponse = NextResponse.redirect(target, { status: 307 })
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie)
      })
      return redirectResponse
    }

    // MUST return supabaseResponse — it carries the refreshed session cookie.
    return supabaseResponse
  }

  // For all other paths (root, landing, public) let next-intl handle locale routing.
  return handleI18n(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
