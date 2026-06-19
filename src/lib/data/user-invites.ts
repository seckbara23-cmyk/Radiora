import { createAdminClient } from '@/lib/supabase/admin'
import { deriveInviteStatus, type InviteStatus } from '@/lib/auth/invite-status'

// Resolves the invitation status (active / opened / pending / expired) for a set
// of clinic users. The lifecycle audit events (user.invite_opened /
// user.invite_accepted) are the primary signal; auth-side timestamps are read
// via the service-role client as a fallback (the auth schema is not exposed
// through RLS, and audit reads are admin-only for non-admins).
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

  // Lifecycle audit events for these users, in one query. Build per-user flags.
  const opened = new Set<string>()
  const accepted = new Set<string>()
  try {
    const { data: events } = await admin
      .from('audit_logs')
      .select('entity_id, action')
      .in('entity_id', userIds)
      .in('action', ['user.invite_opened', 'user.invite_accepted'])
    for (const e of events ?? []) {
      const id = e.entity_id as string | null
      if (!id) continue
      if (e.action === 'user.invite_accepted') accepted.add(id)
      else if (e.action === 'user.invite_opened') opened.add(id)
    }
  } catch {
    // No audit signal → fall back to auth timestamps only.
  }

  // Per-user auth lookups keep us tenant-scoped (only the IDs we were given) and
  // avoid paging the entire platform user list. Failures degrade to no badge.
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id)
        if (error || !data?.user) return
        const u = data.user
        out[id] = deriveInviteStatus({
          hasAccepted: accepted.has(id),
          hasOpened: opened.has(id),
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
