// Pure helpers for the public invite-acceptance route (accept-invite).
//
// Supabase `inviteUserByEmail` links use the implicit (hash-fragment) flow: the
// GoTrue /verify endpoint redirects to our `redirectTo` with the invited user's
// tokens in the URL fragment, e.g.
//
//   /fr/accept-invite#access_token=…&refresh_token=…&type=invite&expires_in=3600
//
// These helpers parse that payload, read the invited identity out of the access
// token, and decide whether another session is already active — WITHOUT touching
// Supabase, so the decision logic is unit-testable and the client never silently
// adopts the wrong session.

export interface InviteTokens {
  accessToken: string | null
  refreshToken: string | null
  /** 'invite' | 'recovery' | 'signup' | 'magiclink' … (GoTrue `type`). */
  type: string | null
  /** Auth error surfaced in the URL (e.g. expired/invalid link). */
  error: string | null
  errorDescription: string | null
}

/**
 * Parse a Supabase auth redirect fragment or query string into its tokens.
 * Accepts the raw `window.location.hash` (with or without a leading '#'),
 * a query string (with or without a leading '?'), or a bare param string.
 */
export function parseInviteTokens(raw: string | null | undefined): InviteTokens {
  const cleaned = (raw ?? '').replace(/^[#?]/, '')
  const params = new URLSearchParams(cleaned)
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    type: params.get('type'),
    error: params.get('error') ?? params.get('error_code'),
    errorDescription: params.get('error_description'),
  }
}

/** True when the fragment carries a usable invite session. */
export function hasInviteSession(tokens: InviteTokens): boolean {
  return Boolean(tokens.accessToken && tokens.refreshToken)
}

/** Base64url → UTF-8 string, runtime-agnostic (browser `atob` or Node Buffer). */
function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const fill = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const b64 = padded + fill
  if (typeof atob === 'function') {
    // Decode to bytes then to UTF-8 so accented emails/names survive.
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }
  // Node / test environment.
  return Buffer.from(b64, 'base64').toString('utf-8')
}

/**
 * Extract the email claim from a JWT access token without verifying its
 * signature (we only use it to compare identities for the conflict screen —
 * the real session validation happens server-side via getUser()).
 */
export function decodeEmailFromJwt(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

/**
 * Decide whether to show the "you are already signed in as X" conflict screen
 * before adopting the invited session.
 *
 * Conflict when a session is already active AND it is not the invited identity
 * (or the invited identity can't be determined — fail safe by warning rather
 * than silently swapping sessions, the exact bug we are fixing).
 */
export function isSessionConflict(
  existingEmail: string | null | undefined,
  invitedEmail: string | null | undefined,
): boolean {
  if (!existingEmail) return false
  if (!invitedEmail) return true
  return existingEmail.trim().toLowerCase() !== invitedEmail.trim().toLowerCase()
}
