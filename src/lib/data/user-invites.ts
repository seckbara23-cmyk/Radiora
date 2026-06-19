import { createAdminClient } from '@/lib/supabase/admin'
import { deriveInviteStatus, type InviteStatus } from '@/lib/auth/invite-status'

// Resolves the invitation status (active / pending / expired) for a set of
// clinic users by reading their auth-side timestamps via the service-role
// client. Kept separate from getClinicUsers() (which is RLS-scoped) because the
// auth schema is not exposed through RLS.
//
// Tenant safety: callers pass the clinic's own profile IDs (already RLS-scoped),
// and we only return status flags — never PHI and never identities the caller
// didn't already have.

export async function getInviteStatuses(userIds: string[]): Promise<Record<string, InviteStatus>> {
  const out: Record<string, InviteStatus> = {}
  if (userIds.length === 0) return out
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return out // no admin key (CI) → omit badges

  const admin = createAdminClient()
  const nowMs = Date.now()

  // Per-user lookups keep us tenant-scoped (only the IDs we were given) and avoid
  // paging the entire platform user list. Failures degrade gracefully to no badge.
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id)
        if (error || !data?.user) return
        const u = data.user
        out[id] = deriveInviteStatus({
          emailConfirmedAt: u.email_confirmed_at ?? u.confirmed_at ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
          invitedAt: u.invited_at ?? u.created_at ?? null,
          nowMs,
        })
      } catch {
        // Ignore — a missing status simply renders no invite badge.
      }
    }),
  )

  return out
}
