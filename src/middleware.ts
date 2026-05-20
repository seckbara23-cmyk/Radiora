import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PROTECTED_PATHS = [
  '/dashboard',
  '/patients',
  '/studies',
  '/reports',
  '/settings',
  '/users',
  '/admin',
  '/audit',
  '/templates',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // When Supabase is not configured (e.g. local dev without .env.local),
  // skip auth enforcement and let every request through.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next()
  }

  let supabaseResponse: NextResponse
  let user: Awaited<ReturnType<typeof updateSession>>['user']

  try {
    const result = await updateSession(request)
    supabaseResponse = result.supabaseResponse
    user = result.user
  } catch {
    // If Supabase is unavailable, pass the request through.
    // Server-side auth guards in each page will handle protection.
    return NextResponse.next()
  }

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))

  // Unauthenticated → redirect to login
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Already authenticated → skip login page
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Must return supabaseResponse — it carries the refreshed session cookie.
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Run on all paths except Next.js internals and static assets.
     * Must be a static string — no dynamic values.
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
