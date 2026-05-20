/**
 * Next.js 16 Proxy (formerly middleware.ts — renamed in v16.0.0)
 *
 * Responsibilities:
 *  1. Refresh the Supabase session cookie on every request
 *  2. Redirect unauthenticated users away from protected routes
 *  3. Redirect authenticated users away from /login
 *
 * IMPORTANT: If NEXT_PUBLIC_SUPABASE_URL is not set (e.g. running with mock
 * data only), the proxy skips all auth logic and lets every request through.
 * Set .env.local to activate protection.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PROTECTED_PATHS = [
  '/dashboard',
  '/patients',
  '/studies',
  '/reports',
  '/settings',
  '/admin',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth enforcement when Supabase is not configured.
  // This keeps the mock-data dev workflow working without .env.local.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next()
  }

  const { supabaseResponse, user } = await updateSession(request)

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))

  // Unauthenticated → redirect to login
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated visiting /login → redirect to dashboard
  if (pathname === '/login' && user) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  // Always return the supabaseResponse — it carries the refreshed session cookie.
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static  (built JS/CSS)
     * - _next/image   (image optimisation)
     * - favicon.ico and common static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
