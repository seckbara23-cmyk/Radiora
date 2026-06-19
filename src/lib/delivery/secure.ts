// F17 — server-only secure primitives for report delivery.
//
// Uses Node's built-in crypto (no external dependency). Tokens are unguessable
// 256-bit URL-safe strings; passwords are hashed with scrypt + per-hash salt and
// verified in constant time. NEVER import this into client code.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// A 32-byte random token, base64url-encoded (43 chars). Used as the secret part
// of a secure link URL (/r/<token>).
export function generateDeliveryToken(): string {
  return randomBytes(32).toString('base64url')
}

const SCRYPT_KEYLEN = 32

// Returns "scrypt$<saltHex>$<hashHex>" so the parameters travel with the hash.
export function hashDeliveryPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export function verifyDeliveryPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const derived = scryptSync(password, salt, expected.length)
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
