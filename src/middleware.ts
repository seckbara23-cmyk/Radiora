import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'

const handleI18n = createIntlMiddleware(routing)

// Dashboard-app paths that require an authenticated session (locale-stripped).
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
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

    // Already authenticated → skip the login page.
    if (isLoginPage && user) {
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url), { status: 303 })
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
