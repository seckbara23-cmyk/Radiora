import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser (Client Component) Supabase client.
 * Call this inside a Client Component or event handler.
 * Never use this in Server Components or Route Handlers — use server.ts instead.
 *
 * To add full TypeScript types, run:
 *   npx supabase gen types typescript --local > src/types/supabase.ts
 * and pass the Database type as a generic: createBrowserClient<Database>(...)
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
