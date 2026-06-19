import { describe, it, expect } from 'vitest'
import {
  isVerificationChannel,
  normalizeEmail,
  isValidEmail,
  normalizeSenegalPhone,
  maskPhone,
  generateOtp,
  isOtpCode,
  isOtpExpired,
  passwordIssue,
  slugifyClinic,
} from './signup'

describe('isVerificationChannel', () => {
  it('accepts email/phone, rejects junk', () => {
    expect(isVerificationChannel('email')).toBe(true)
    expect(isVerificationChannel('phone')).toBe(true)
    expect(isVerificationChannel('sms')).toBe(false)
  })
})

describe('email helpers', () => {
  it('normalises and validates', () => {
    expect(normalizeEmail('  Bara@Radiora.SN ')).toBe('bara@radiora.sn')
    expect(isValidEmail('bara@radiora.sn')).toBe(true)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
})

describe('normalizeSenegalPhone', () => {
  it('accepts national, +221, 00221, spaced forms', () => {
    expect(normalizeSenegalPhone('77 123 45 67')).toBe('+221771234567')
    expect(normalizeSenegalPhone('771234567')).toBe('+221771234567')
    expect(normalizeSenegalPhone('+221 77 123 45 67')).toBe('+221771234567')
    expect(normalizeSenegalPhone('0022177 123 45 67')).toBe('+221771234567')
  })

  it('rejects wrong length or non-mobile prefixes', () => {
    expect(normalizeSenegalPhone('12345')).toBeNull()
    expect(normalizeSenegalPhone('331234567')).toBeNull() // landline prefix 3
    expect(normalizeSenegalPhone('')).toBeNull()
  })
})

describe('maskPhone', () => {
  it('reveals only the last two digits', () => {
    expect(maskPhone('+221771234567')).toBe('+221 •• •• ••67')
  })
})

describe('OTP helpers', () => {
  it('generates a 6-digit zero-padded code deterministically', () => {
    expect(generateOtp(() => 0)).toBe('000000')
    expect(generateOtp(() => 0.123456)).toBe('123456')
    expect(generateOtp(() => 0.000042)).toBe('000042')
    expect(isOtpCode(generateOtp(() => 0.5))).toBe(true)
  })

  it('validates the code shape', () => {
    expect(isOtpCode('123456')).toBe(true)
    expect(isOtpCode('12345')).toBe(false)
    expect(isOtpCode('abcdef')).toBe(false)
  })

  it('expires after the TTL', () => {
    const issued = '2026-06-18T00:00:00.000Z'
    expect(isOtpExpired(issued, '2026-06-18T00:05:00.000Z', 10)).toBe(false)
    expect(isOtpExpired(issued, '2026-06-18T00:11:00.000Z', 10)).toBe(true)
    expect(isOtpExpired('bad', '2026-06-18T00:00:00.000Z')).toBe(true)
  })
})

describe('passwordIssue', () => {
  it('enforces length, a letter and a digit', () => {
    expect(passwordIssue('short1')).toBe('too_short')
    expect(passwordIssue('allletters')).toBe('needs_digit')
    expect(passwordIssue('12345678')).toBe('needs_letter')
    expect(passwordIssue('radiora2026')).toBeNull()
  })
})

describe('slugifyClinic', () => {
  it('produces url-safe slugs and strips accents', () => {
    expect(slugifyClinic('Centre d’Imagerie Médicale')).toBe('centre-d-imagerie-medicale')
    expect(slugifyClinic('  Hôpital Principal  ')).toBe('hopital-principal')
  })
})
