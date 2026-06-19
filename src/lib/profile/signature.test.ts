import { describe, it, expect } from 'vitest'
import { buildSignatureName, coerceSignatureStyle } from './signature'

describe('buildSignatureName', () => {
  it('Dr + full name', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Dr', firstName: 'Abibou', lastName: 'Ba', style: 'full' }),
    ).toBe('Dr Abibou Ba')
  })

  it('Pr + full name', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Pr', firstName: 'Abibou', lastName: 'Ba', style: 'full' }),
    ).toBe('Pr Abibou Ba')
  })

  it('Dr + initials + surname (single given name)', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Dr', firstName: 'Abibou', lastName: 'Ba', style: 'initials_surname' }),
    ).toBe('Dr A. Ba')
  })

  it('initials + surname keeps one initial per given name', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Dr', firstName: 'Abibou Cheikh', lastName: 'Ba', style: 'initials_surname' }),
    ).toBe('Dr A. C. Ba')
  })

  it('custom returns the verbatim text', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Dr', firstName: 'X', lastName: 'Y', style: 'custom', custom: 'Pr. A. BA, Agrégé' }),
    ).toBe('Pr. A. BA, Agrégé')
  })

  it('custom with empty text returns empty string (caller falls back)', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Dr', firstName: 'X', lastName: 'Y', style: 'custom', custom: '   ' }),
    ).toBe('')
  })

  it('collapses extra whitespace and tolerates missing names', () => {
    expect(
      buildSignatureName({ titlePrefix: 'Dr', firstName: '  ', lastName: 'Ba', style: 'full' }),
    ).toBe('Dr Ba')
  })
})

describe('coerceSignatureStyle', () => {
  it('passes through known styles', () => {
    expect(coerceSignatureStyle('initials_surname')).toBe('initials_surname')
    expect(coerceSignatureStyle('custom')).toBe('custom')
  })
  it('defaults unknown/empty to full', () => {
    expect(coerceSignatureStyle(null)).toBe('full')
    expect(coerceSignatureStyle('')).toBe('full')
    expect(coerceSignatureStyle('bogus')).toBe('full')
  })
})
