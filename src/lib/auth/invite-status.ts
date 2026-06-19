// Derives a human-facing invitation status for a user. Pure & deterministic so
// it can be unit-tested without Supabase.
//
//   • active   — the invite was accepted (invite_accepted logged) OR the account
//                is otherwise usable (email confirmed / has signed in before)
//   • opened   — the invitee opened the invite link (invite_opened logged) but
//                has not finished activation yet
//   • pending  — invited, not yet opened/accepted, and the link is still valid
//   • expired  — invited, not yet opened/accepted, and the invite window elapsed
//
// The lifecycle audit events (user.invite_opened / user.invite_accepted) are the
// primary signal. Auth-side timestamps are kept as a fallback so accounts that
// became active before lifecycle tracking still read as "active".
//
// Supabase invite/confirmation links expire 24h after they are generated
// (GoTrue default invite token TTL). We mirror that here so the Users list can
// offer a "resend" affordance once a link can no longer work.

export type InviteStatus = 'active' | 'opened' | 'pending' | 'expired'

export const INVITE_EXPIRY_HOURS = 24

export interface InviteStatusInput {
  /** A user.invite_accepted audit event exists (password set / account activated). */
  hasAccepted?: boolean
  /** A user.invite_opened audit event exists (invitee reached accept-invite). */
  hasOpened?: boolean
  /** auth.users.email_confirmed_at (or confirmed_at) — set once the user verifies. */
  emailConfirmedAt?: string | null
  /** auth.users.last_sign_in_at — set the first time the user authenticates. */
  lastSignInAt?: string | null
  /** auth.users.invited_at — set when the invitation was issued. */
  invitedAt?: string | null
  /** Current time in ms (injected for testability). */
  nowMs: number
}

export function deriveInviteStatus({
  hasAccepted,
  hasOpened,
  emailConfirmedAt,
  lastSignInAt,
  invitedAt,
  nowMs,
}: InviteStatusInput): InviteStatus {
  // The account can sign in if it accepted the invite, confirmed its email, or
  // has authenticated before — any of these means fully active.
  const canSignIn = Boolean(emailConfirmedAt || lastSignInAt)
  if (hasAccepted || canSignIn) return 'active'

  // Opened the invite link but hasn't completed activation.
  if (hasOpened) return 'opened'

  // Still awaiting the first open — decide pending vs. expired from the age.
  if (invitedAt) {
    const issuedMs = Date.parse(invitedAt)
    if (!Number.isNaN(issuedMs)) {
      const ageMs = nowMs - issuedMs
      if (ageMs > INVITE_EXPIRY_HOURS * 60 * 60 * 1000) return 'expired'
    }
  }

  return 'pending'
}
