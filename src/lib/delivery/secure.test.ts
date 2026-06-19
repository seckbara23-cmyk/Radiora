import { describe, it, expect } from 'vitest'
import { generateDeliveryToken, hashDeliveryPassword, verifyDeliveryPassword } from './secure'

describe('generateDeliveryToken', () => {
  it('produces unguessable, URL-safe, unique tokens', () => {
    const a = generateDeliveryToken()
    const b = generateDeliveryToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.length).toBeGreaterThanOrEqual(40)
  })
})

describe('hashDeliveryPassword / verifyDeliveryPassword', () => {
  it('verifies the correct password and rejects wrong ones', () => {
    const stored = hashDeliveryPassword('02071990')
    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(verifyDeliveryPassword('02071990', stored)).toBe(true)
    expect(verifyDeliveryPassword('wrong', stored)).toBe(false)
  })

  it('uses a per-hash salt so identical passwords hash differently', () => {
    const a = hashDeliveryPassword('same')
    const b = hashDeliveryPassword('same')
    expect(a).not.toBe(b)
    expect(verifyDeliveryPassword('same', a)).toBe(true)
    expect(verifyDeliveryPassword('same', b)).toBe(true)
  })

  it('rejects malformed or empty stored hashes', () => {
    expect(verifyDeliveryPassword('x', null)).toBe(false)
    expect(verifyDeliveryPassword('x', '')).toBe(false)
    expect(verifyDeliveryPassword('x', 'not-a-hash')).toBe(false)
    expect(verifyDeliveryPassword('x', 'scrypt$onlytwo')).toBe(false)
  })
})
