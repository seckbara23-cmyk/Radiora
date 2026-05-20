import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session cookie on every request.
 * Called from proxy.ts (the Next.js 16 equivalent of middleware.ts).
 *
 * IMPORTANT: No logic between createServerClient and supabase.auth.getUser().
 * The session must be refreshed before any routing decisions are made.
 *
 * Returns the supabase response (with refreshed cookies) and the current user.
 * The caller MUST return `supabaseResponse` — replacing it without forwarding
 * the cookies will break the session.
 */
export async function updateSession(request: NextRequest) {
  // Start with a pass-through response; we may replace it if cookies are set.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write the new cookie values onto the request first (for upstream use)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Rebuild the response so it carries the Set-Cookie headers
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the session server-side and refreshes the token if needed.
  // Do NOT use getSession() here — it trusts the cookie without re-validating.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}
