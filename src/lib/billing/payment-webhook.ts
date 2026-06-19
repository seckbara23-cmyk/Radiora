// Phase 5C/5D — provider webhook rails (Wave first, Orange Money next).
//
// This module is the PURE, deterministic core of the payment-confirmation path:
// it classifies provider events, computes/verifies HMAC signatures and builds the
// hosted-checkout URL. It performs no IO and no DB access — the webhook route and
// the payment actions call into it.
//
// IMPORTANT: Radiora still does NOT hold real provider credentials. A real Wave /
// Orange Money integration POSTs a signed event to our webhook; here we model the
// exact contract (signed body, idempotent event id, normalized event types) so the
// last mile is only a matter of setting the shared secret + checkout base URL.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type PaymentProvider = 'wave' | 'orange_money'

export const WEBHOOK_PROVIDERS: PaymentProvider[] = ['wave', 'orange_money']

export function isPaymentProvider(value: string): value is PaymentProvider {
  return (WEBHOOK_PROVIDERS as string[]).includes(value)
}

// What a provider event means for our payment state machine.
//  - success: the payer completed the charge → confirm payment, activate sub.
//  - failure: the charge failed / was cancelled / expired (timeout) → grace.
//  - ignore:  informational events we record but do not act on.
export type EventOutcome = 'success' | 'failure' | 'ignore'

// Normalized event shape we expect in the (signed) request body. Both providers
// are mapped onto this single contract by the route.
export type ProviderEvent = {
  /** Provider's unique event id — the idempotency key. */
  id: string
  /** Provider event type string, e.g. "checkout.session.completed". */
  type: string
  /** Our payment/checkout reference (payments.provider_ref). */
  reference: string
}

// Map a raw provider event-type string onto our outcome. Kept permissive on the
// surface forms because Wave and Orange Money phrase the same lifecycle events
// differently ("completed" vs "succeeded", "expired" timeout vs "cancelled").
export function classifyEventType(eventType: string): EventOutcome {
  const t = eventType.toLowerCase()
  if (/(completed|succeeded|success|paid|confirmed)/.test(t)) return 'success'
  if (/(failed|cancel|declin|expired|timeout|refused|reversed)/.test(t)) return 'failure'
  return 'ignore'
}

// Parse + shallow-validate the JSON body into a ProviderEvent. Returns null when
// the body is not the expected shape (the route then rejects with 400).
export function parseProviderEvent(raw: unknown): ProviderEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const type = typeof o.type === 'string' ? o.type.trim() : ''
  // reference may sit at the top level or nested under data (provider-dependent).
  const data = (o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : {})
  const refRaw = (typeof o.reference === 'string' && o.reference) || (typeof data.reference === 'string' && data.reference) || ''
  const reference = typeof refRaw === 'string' ? refRaw.trim() : ''
  if (!id || !type || !reference) return null
  return { id, type, reference }
}

// HMAC-SHA256 of the exact raw request body, hex-encoded. The provider signs the
// same bytes with the shared secret and sends the digest in a header.
export function computeSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

// Constant-time comparison of a provided signature against the expected one.
// Tolerates an optional "sha256=" prefix and is case-insensitive on the hex.
export function signaturesMatch(expectedHex: string, providedHeader: string | null | undefined): boolean {
  if (!providedHeader) return false
  const provided = providedHeader.trim().replace(/^sha256=/i, '').toLowerCase()
  const expected = expectedHex.toLowerCase()
  if (provided.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// Build the hosted-checkout URL the clinic is redirected to after choosing a plan.
// The base comes from env (stand-in until real provider onboarding); the reference
// ties the session back to our pending payment so the webhook can reconcile it.
export function buildCheckoutUrl(base: string, reference: string): string {
  const trimmed = base.replace(/\/+$/, '')
  return `${trimmed}/c/${encodeURIComponent(reference)}`
}
