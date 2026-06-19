// Derives a human-facing invitation status for a user from their auth-side
// timestamps. Pure & deterministic so it can be unit-tested without Supabase.
//
//   • active   — the invitee has confirmed their email or signed in at least once
//   • pending  — invited, not yet confirmed, and the invite link is still valid
//   • expired  — invited, not yet confirmed, and the invite window has elapsed
//
// Supabase invite/confirmation links expire 24h after they are generated
// (GoTrue default `MAILER_OTP_EXP` / invite token TTL). We mirror that here so
// the Users list can offer a "resend" affordance once a link can no longer work.

export type InviteStatus = 'active' | 'pending' | 'expired'

export const INVITE_EXPIRY_HOURS = 24

export interface InviteStatusInput {
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
  emailConfirmedAt,
  lastSignInAt,
  invitedAt,
  nowMs,
}: InviteStatusInput): InviteStatus {
  // Confirmed email or a prior sign-in means the account is fully active.
  if (emailConfirmedAt || lastSignInAt) return 'active'

  // Still awaiting acceptance — decide pending vs. expired from the invite age.
  if (invitedAt) {
    const issuedMs = Date.parse(invitedAt)
    if (!Number.isNaN(issuedMs)) {
      const ageMs = nowMs - issuedMs
      if (ageMs > INVITE_EXPIRY_HOURS * 60 * 60 * 1000) return 'expired'
    }
  }

  return 'pending'
}
