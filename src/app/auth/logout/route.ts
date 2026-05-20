import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Server-side sign-out — clears the session and invalidates the refresh token.
  // The Supabase SSR client's setAll callback writes the cleared cookie values
  // back via next/headers cookieStore, which are included in the Route Handler response.
  await supabase.auth.signOut()

  // Detect locale from the Referer header (e.g. https://radiora.vercel.app/fr/dashboard)
  // so logout redirects to the same locale's login page.
  const referer = request.headers.get('referer') ?? ''
  const localeMatch = referer.match(/\/(fr|en)(\/|$)/)
  const locale = localeMatch ? localeMatch[1] : 'fr'

  // 303 See Other forces the browser to follow the redirect as GET regardless of
  // the original method. The default 307 would re-POST to /login, causing a 405.
  const response = NextResponse.redirect(
    new URL(`/${locale}/login`, request.url),
    { status: 303 },
  )

  // Belt-and-suspenders: explicitly expire all Supabase auth cookies on the
  // response so they are cleared even if the SSR client's setAll callback does
  // not propagate through the redirect in certain hosting environments.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') || cookie.name === 'supabase-auth-token') {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
    }
  }

  response.headers.set('Cache-Control', 'no-store')
  return response
}
