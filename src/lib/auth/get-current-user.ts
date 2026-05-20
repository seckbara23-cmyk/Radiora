import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/user'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string
  email: string
  role: UserRole
  clinicId: string | null  // null for super_admin (cross-clinic access)
  firstName: string
  lastName: string
  specialty: string | null
  licenseNumber: string | null
  isActive: boolean
}

export type CurrentUserResult =
  | { status: 'unauthenticated' }
  | { status: 'no_profile'; id: string; email: string }
  | { status: 'ok'; user: CurrentUser }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches the authenticated user and their profile row.
 * Returns a discriminated union so callers can handle each state explicitly.
 * Does NOT redirect — use requireCurrentUser() in pages that always need a user.
 *
 * Server-side only: uses cookies() from next/headers via createClient().
 */
export async function getCurrentUser(): Promise<CurrentUserResult> {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { status: 'unauthenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, clinic_id, first_name, last_name, specialty, license_number, is_active')
    .eq('id', authUser.id)
    .single()

  if (!profile) {
    return {
      status: 'no_profile',
      id: authUser.id,
      email: authUser.email ?? '',
    }
  }

  return {
    status: 'ok',
    user: {
      id: authUser.id,
      email: authUser.email ?? '',
      role: profile.role as UserRole,
      clinicId: profile.clinic_id ?? null,
      firstName: profile.first_name,
      lastName: profile.last_name,
      specialty: profile.specialty ?? null,
      licenseNumber: profile.license_number ?? null,
      isActive: profile.is_active,
    },
  }
}

/**
 * Like getCurrentUser() but handles redirects automatically:
 *   no session   → redirect to /login
 *   no profile   → redirect to /onboarding-error
 *   ok           → returns CurrentUser
 *
 * Safe to call directly from async Server Components and Route Handlers.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const result = await getCurrentUser()

  if (result.status === 'unauthenticated') {
    redirect('/login')
  }

  if (result.status === 'no_profile') {
    redirect('/onboarding-error')
  }

  return result.user
}
