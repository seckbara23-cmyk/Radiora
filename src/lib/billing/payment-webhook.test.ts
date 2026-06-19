import { describe, it, expect } from 'vitest'
import {
  isPaymentProvider,
  classifyEventType,
  parseProviderEvent,
  computeSignature,
  signaturesMatch,
  buildCheckoutUrl,
} from './payment-webhook'

describe('isPaymentProvider', () => {
  it('accepts wave and orange_money only', () => {
    expect(isPaymentProvider('wave')).toBe(true)
    expect(isPaymentProvider('orange_money')).toBe(true)
    expect(isPaymentProvider('card')).toBe(false)
    expect(isPaymentProvider('')).toBe(false)
  })
})

describe('classifyEventType', () => {
  it('maps completed/succeeded forms to success', () => {
    expect(classifyEventType('checkout.session.completed')).toBe('success')
    expect(classifyEventType('payment.succeeded')).toBe('success')
    expect(classifyEventType('CHARGE.CONFIRMED')).toBe('success')
  })
  it('maps failed/cancelled/expired (timeout) forms to failure', () => {
    expect(classifyEventType('checkout.session.failed')).toBe('failure')
    expect(classifyEventType('payment.cancelled')).toBe('failure')
    expect(classifyEventType('checkout.expired')).toBe('failure') // timeout
    expect(classifyEventType('charge.declined')).toBe('failure')
  })
  it('ignores unrelated informational events', () => {
    expect(classifyEventType('checkout.session.created')).toBe('ignore')
    expect(classifyEventType('ping')).toBe('ignore')
  })
})

describe('parseProviderEvent', () => {
  it('reads reference at the top level', () => {
    expect(parseProviderEvent({ id: 'evt_1', type: 'x', reference: 'wave-abc' })).toEqual({
      id: 'evt_1',
      type: 'x',
      reference: 'wave-abc',
    })
  })
  it('reads reference nested under data', () => {
    expect(parseProviderEvent({ id: 'evt_1', type: 'x', data: { reference: 'wave-abc' } })).toEqual({
      id: 'evt_1',
      type: 'x',
      reference: 'wave-abc',
    })
  })
  it('rejects bodies missing id, type or reference', () => {
    expect(parseProviderEvent(null)).toBeNull()
    expect(parseProviderEvent({ id: 'evt_1', type: 'x' })).toBeNull()
    expect(parseProviderEvent({ type: 'x', reference: 'r' })).toBeNull()
    expect(parseProviderEvent('nope')).toBeNull()
  })
})

describe('signature compute + verify', () => {
  const secret = 'whsec_test_123'
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', reference: 'wave-abc' })

  it('verifies a correctly-signed body', () => {
    const sig = computeSignature(body, secret)
    expect(signaturesMatch(sig, sig)).toBe(true)
    expect(signaturesMatch(sig, `sha256=${sig.toUpperCase()}`)).toBe(true)
  })
  it('rejects a wrong signature, wrong secret and a missing header', () => {
    const sig = computeSignature(body, secret)
    expect(signaturesMatch(sig, computeSignature(body, 'other-secret'))).toBe(false)
    expect(signaturesMatch(sig, null)).toBe(false)
    expect(signaturesMatch(sig, 'deadbeef')).toBe(false)
  })
  it('rejects a tampered body', () => {
    const sig = computeSignature(body, secret)
    const tampered = computeSignature(body.replace('wave-abc', 'wave-xyz'), secret)
    expect(signaturesMatch(sig, tampered)).toBe(false)
  })
})

describe('buildCheckoutUrl', () => {
  it('joins base + reference and trims trailing slashes', () => {
    expect(buildCheckoutUrl('https://pay.example.com', 'wave-abc')).toBe('https://pay.example.com/c/wave-abc')
    expect(buildCheckoutUrl('https://pay.example.com/', 'wave-abc')).toBe('https://pay.example.com/c/wave-abc')
  })
  it('encodes the reference', () => {
    expect(buildCheckoutUrl('https://pay.example.com', 'a b/c')).toBe('https://pay.example.com/c/a%20b%2Fc')
  })
})
