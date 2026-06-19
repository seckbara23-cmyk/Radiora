import { describe, it, expect } from 'vitest'
import { deriveInviteStatus, INVITE_EXPIRY_HOURS } from '@/lib/auth/invite-status'
import {
  parseInviteTokens,
  hasInviteSession,
  decodeEmailFromJwt,
  isSessionConflict,
} from '@/lib/auth/invite-callback'

const NOW = Date.parse('2026-06-19T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()

// Build an unsigned JWT carrying the given payload (signature is irrelevant —
// decodeEmailFromJwt never verifies it).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

describe('deriveInviteStatus', () => {
  it('is active once the email is confirmed', () => {
    expect(deriveInviteStatus({ emailConfirmedAt: hoursAgo(1), invitedAt: hoursAgo(50), nowMs: NOW })).toBe('active')
  })

  it('is active once the user has signed in (even if confirmed_at is absent)', () => {
    expect(deriveInviteStatus({ lastSignInAt: hoursAgo(1), invitedAt: hoursAgo(50), nowMs: NOW })).toBe('active')
  })

  it('is pending when recently invited and not yet confirmed', () => {
    expect(deriveInviteStatus({ invitedAt: hoursAgo(2), nowMs: NOW })).toBe('pending')
  })

  it('is expired when the invite is older than the expiry window and unconfirmed', () => {
    expect(deriveInviteStatus({ invitedAt: hoursAgo(INVITE_EXPIRY_HOURS + 1), nowMs: NOW })).toBe('expired')
  })

  it('treats the expiry boundary as still pending', () => {
    expect(deriveInviteStatus({ invitedAt: hoursAgo(INVITE_EXPIRY_HOURS), nowMs: NOW })).toBe('pending')
  })

  it('defaults to pending when no timestamps are available', () => {
    expect(deriveInviteStatus({ nowMs: NOW })).toBe('pending')
    expect(deriveInviteStatus({ invitedAt: 'not-a-date', nowMs: NOW })).toBe('pending')
  })

  it('is active when the invite was accepted (lifecycle event)', () => {
    expect(deriveInviteStatus({ hasAccepted: true, invitedAt: hoursAgo(2), nowMs: NOW })).toBe('active')
  })

  it('is opened when the invite was opened but not yet accepted', () => {
    expect(deriveInviteStatus({ hasOpened: true, invitedAt: hoursAgo(2), nowMs: NOW })).toBe('opened')
  })

  it('prefers accepted over opened when both events exist', () => {
    expect(deriveInviteStatus({ hasOpened: true, hasAccepted: true, invitedAt: hoursAgo(2), nowMs: NOW })).toBe('active')
  })

  it('treats an opened-but-not-accepted invite as opened even past the expiry window', () => {
    // Once the invitee has engaged, "opened" is more informative than "expired".
    expect(deriveInviteStatus({ hasOpened: true, invitedAt: hoursAgo(INVITE_EXPIRY_HOURS + 5), nowMs: NOW })).toBe('opened')
  })

  it('still reads as active from auth timestamps without lifecycle events (legacy)', () => {
    expect(deriveInviteStatus({ emailConfirmedAt: hoursAgo(1), nowMs: NOW })).toBe('active')
  })
})

describe('parseInviteTokens / hasInviteSession', () => {
  it('parses a Supabase invite fragment', () => {
    const t = parseInviteTokens('#access_token=AAA&refresh_token=BBB&type=invite&expires_in=3600')
    expect(t.accessToken).toBe('AAA')
    expect(t.refreshToken).toBe('BBB')
    expect(t.type).toBe('invite')
    expect(hasInviteSession(t)).toBe(true)
  })

  it('parses an error fragment (expired link) and reports no session', () => {
    const t = parseInviteTokens('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired')
    expect(t.error).toBe('access_denied')
    expect(t.errorDescription).toContain('expired')
    expect(hasInviteSession(t)).toBe(false)
  })

  it('handles query-string form and empty input', () => {
    expect(parseInviteTokens('?access_token=X&refresh_token=Y').accessToken).toBe('X')
    expect(hasInviteSession(parseInviteTokens(''))).toBe(false)
    expect(hasInviteSession(parseInviteTokens(null))).toBe(false)
  })
})

describe('decodeEmailFromJwt', () => {
  it('reads the email claim from an access token', () => {
    expect(decodeEmailFromJwt(fakeJwt({ email: 'invitee@clinic.sn', role: 'authenticated' }))).toBe('invitee@clinic.sn')
  })

  it('returns null for malformed or claimless tokens', () => {
    expect(decodeEmailFromJwt(null)).toBeNull()
    expect(decodeEmailFromJwt('not.a.jwt.token')).toBeNull()
    expect(decodeEmailFromJwt('only-one-part')).toBeNull()
    expect(decodeEmailFromJwt(fakeJwt({ role: 'authenticated' }))).toBeNull()
  })
})

describe('isSessionConflict', () => {
  it('warns when a different session is already active', () => {
    expect(isSessionConflict('admin@clinic.sn', 'invitee@clinic.sn')).toBe(true)
  })

  it('does not warn when the active session is the invited identity (case-insensitive)', () => {
    expect(isSessionConflict('Invitee@Clinic.SN', 'invitee@clinic.sn')).toBe(false)
  })

  it('does not warn when no session is active', () => {
    expect(isSessionConflict(null, 'invitee@clinic.sn')).toBe(false)
  })

  it('warns (fail-safe) when a session is active but the invited identity is unknown', () => {
    expect(isSessionConflict('admin@clinic.sn', null)).toBe(true)
  })
})
