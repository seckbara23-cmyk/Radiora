import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server (Server Component / Route Handler / Server Action) Supabase client.
 * Must be awaited — Next.js 15+ cookies() is async.
 *
 * The try/catch in setAll is intentional: Server Components can't set cookies,
 * so we silently ignore the error when called from an RSC. The proxy.ts file
 * handles session refreshing so this is safe.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — proxy.ts handles the refresh.
          }
        },
      },
    }
  )
}
