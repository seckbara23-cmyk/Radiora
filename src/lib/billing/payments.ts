// Phase 4C/4D — payment method rails (provider-agnostic, deterministic).
//
// IMPORTANT: Radiora does NOT call any real payment provider here. There are no
// API keys and no network calls. This module only models the payment METHODS
// (Wave first, then Orange Money, then bank card — the Senegal priority order)
// and the pure helpers around invoices/references. Initiated payments stay
// `pending` until a platform admin reconciles them (manual confirmation),
// which is the safe stand-in until real Wave / Orange Money integrations and
// their webhooks are wired with credentials.

export type PaymentMethod = 'wave' | 'orange_money' | 'card' | 'manual'

// Methods a clinic can choose, in Senegal priority order.
export const CLINIC_PAYMENT_METHODS: PaymentMethod[] = ['wave', 'orange_money', 'card']

export const ALL_PAYMENT_METHODS: PaymentMethod[] = ['wave', 'orange_money', 'card', 'manual']

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (ALL_PAYMENT_METHODS as string[]).includes(value)
}

// Mobile-money methods need a payer phone number; card/manual do not.
export function methodRequiresPhone(method: PaymentMethod): boolean {
  return method === 'wave' || method === 'orange_money'
}

// Human-facing invoice number: INV-YYYYMM-#### (sequence is per-month, 1-based).
export function generateInvoiceNumber(sequence: number, nowISO: string): string {
  const ym = nowISO.slice(0, 7).replace('-', '')
  return `INV-${ym}-${String(Math.max(1, sequence)).padStart(4, '0')}`
}

// An invoice can receive a payment only while it is open (or draft about to be
// sent). Paid / void / uncollectible invoices are terminal.
export function invoiceIsPayable(status: string): boolean {
  return status === 'open' || status === 'draft'
}

// Add whole days to an ISO timestamp (UTC), returning ISO. Used for renewal
// periods and grace windows.
export function addDaysISO(fromISO: string, days: number): string {
  const d = new Date(fromISO)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}
