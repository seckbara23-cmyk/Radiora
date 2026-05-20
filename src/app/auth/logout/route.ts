import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Server-side sign-out — clears the session and invalidates the refresh token.
  // The Supabase SSR client's setAll callback writes the cleared cookie values
  // back via next/headers cookieStore, which are included in the Route Handler response.
  await supabase.auth.signOut()

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'

  const response = NextResponse.redirect(loginUrl)
  // Prevent the browser from serving a cached version of a protected page
  // when the user presses the back button after logging out.
  response.headers.set('Cache-Control', 'no-store')
  return response
}
