import { createClient } from '@supabase/supabase-js'

/**
 * Service-role (admin) Supabase client.
 * Bypasses Row Level Security — use ONLY in trusted server-side contexts
 * (Route Handlers, Server Actions, background jobs).
 * NEVER import this in Client Components or expose to the browser.
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
