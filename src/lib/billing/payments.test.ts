import { describe, it, expect } from 'vitest'
import {
  isPaymentMethod,
  methodRequiresPhone,
  generateInvoiceNumber,
  generateReceiptNumber,
  invoiceIsPayable,
  addDaysISO,
  CLINIC_PAYMENT_METHODS,
} from './payments'

describe('payment methods', () => {
  it('lists clinic methods in Senegal priority order (Wave first)', () => {
    expect(CLINIC_PAYMENT_METHODS).toEqual(['wave', 'orange_money', 'card'])
  })

  it('validates method strings', () => {
    expect(isPaymentMethod('wave')).toBe(true)
    expect(isPaymentMethod('orange_money')).toBe(true)
    expect(isPaymentMethod('bitcoin')).toBe(false)
  })

  it('requires a phone only for mobile money', () => {
    expect(methodRequiresPhone('wave')).toBe(true)
    expect(methodRequiresPhone('orange_money')).toBe(true)
    expect(methodRequiresPhone('card')).toBe(false)
    expect(methodRequiresPhone('manual')).toBe(false)
  })
})

describe('generateInvoiceNumber', () => {
  it('formats INV-YYYYMM-#### with zero-padded sequence', () => {
    expect(generateInvoiceNumber(1, '2026-06-18T00:00:00.000Z')).toBe('INV-202606-0001')
    expect(generateInvoiceNumber(42, '2026-12-01T00:00:00.000Z')).toBe('INV-202612-0042')
  })

  it('never produces a sub-1 sequence', () => {
    expect(generateInvoiceNumber(0, '2026-06-18T00:00:00.000Z')).toBe('INV-202606-0001')
  })
})

describe('generateReceiptNumber', () => {
  it('formats REC-YYYYMM-#### with zero-padded sequence', () => {
    expect(generateReceiptNumber(1, '2026-06-18T00:00:00.000Z')).toBe('REC-202606-0001')
    expect(generateReceiptNumber(7, '2026-12-01T00:00:00.000Z')).toBe('REC-202612-0007')
  })
})

describe('invoiceIsPayable', () => {
  it('is payable when open or draft, terminal otherwise', () => {
    expect(invoiceIsPayable('open')).toBe(true)
    expect(invoiceIsPayable('draft')).toBe(true)
    expect(invoiceIsPayable('paid')).toBe(false)
    expect(invoiceIsPayable('void')).toBe(false)
  })
})

describe('addDaysISO', () => {
  it('adds days in UTC', () => {
    expect(addDaysISO('2026-06-18T00:00:00.000Z', 30)).toBe('2026-07-18T00:00:00.000Z')
  })
})
