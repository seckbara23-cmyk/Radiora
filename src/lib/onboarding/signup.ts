// Phase 5B — pure helpers for public self-service onboarding.
//
// Deterministic, IO-free, unit-tested. These encode the validation and
// verification rules for the public "start your free trial" flow. The server
// actions in src/lib/actions/onboarding.ts apply them against Supabase; the
// rules (is this email/phone well-formed? is the OTP expired? is the password
// strong enough?) live here so they can be tested without a database.

export type VerificationChannel = 'email' | 'phone'
export const VERIFICATION_CHANNELS: VerificationChannel[] = ['email', 'phone']

export function isVerificationChannel(value: string): value is VerificationChannel {
  return (VERIFICATION_CHANNELS as readonly string[]).includes(value)
}

// ── Email ──────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw))
}

// ── Phone (Senegal / West Africa, E.164-ish) ────────────────────────────────────

/**
 * Normalise a Senegalese mobile number to +221XXXXXXXXX.
 * Accepts: "77 123 45 67", "771234567", "+221771234567", "00221771234567".
 * Returns null when it cannot be coerced into a 9-digit national number.
 */
export function normalizeSenegalPhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+221')) digits = digits.slice(4)
  else if (digits.startsWith('00221')) digits = digits.slice(5)
  else if (digits.startsWith('221') && digits.length === 12) digits = digits.slice(3)
  digits = digits.replace(/\D/g, '')
  if (digits.length !== 9) return null
  // Senegalese mobile prefixes start with 7.
  if (!digits.startsWith('7')) return null
  return `+221${digits}`
}

export function maskPhone(normalized: string): string {
  // +221771234567 → +221 •• •• ••67
  if (normalized.length < 4) return normalized
  const last2 = normalized.slice(-2)
  return `+221 •• •• ••${last2}`
}

// ── One-time codes ──────────────────────────────────────────────────────────────

export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5

/** Generate a zero-padded 6-digit code. `rand` is injected for determinism. */
export function generateOtp(rand: () => number): string {
  const n = Math.floor(rand() * 1_000_000)
  return String(n).padStart(6, '0')
}

export function isOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

/** A verification code is expired once `ttlMinutes` have elapsed since issue. */
export function isOtpExpired(issuedAtISO: string, nowISO: string, ttlMinutes = OTP_TTL_MINUTES): boolean {
  const issued = new Date(issuedAtISO).getTime()
  const now = new Date(nowISO).getTime()
  if (!Number.isFinite(issued) || !Number.isFinite(now)) return true
  return now - issued > ttlMinutes * 60_000
}

// ── Password ────────────────────────────────────────────────────────────────────

export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return 'too_short'
  if (!/[a-zA-Z]/.test(pw)) return 'needs_letter'
  if (!/\d/.test(pw)) return 'needs_digit'
  return null
}

// ── Clinic slug ─────────────────────────────────────────────────────────────────

export function slugifyClinic(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
