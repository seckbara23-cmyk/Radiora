// Phase 5C/5D — provider payment webhook.
//
//   POST /api/payments/wave/webhook
//   POST /api/payments/orange_money/webhook
//
// A provider POSTs a signed event when a hosted-checkout session resolves. We:
//   1. verify the HMAC signature against the provider's shared secret,
//   2. record the event (idempotency + "audit every payment event"),
//   3. apply the matching payment transition (confirm + activate / fail → grace).
//
// Retry/timeout handling: a provider re-delivers on any non-2xx. We are idempotent
// on (provider, event_id): a duplicate is recorded as such and returns 200 so the
// provider stops retrying. A "checkout expired" event (the payer never finished —
// i.e. a timeout) classifies as a failure and moves the subscription to grace.
//
// SECURITY: the per-provider shared secret (WAVE_WEBHOOK_SECRET /
// ORANGE_MONEY_WEBHOOK_SECRET) must be set server-side. With no secret configured
// we return 503 and process nothing — we never trust an unsigned payment event.
// No real credentials ship in the repo; this is the production-correct contract
// awaiting provider onboarding.

import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  isPaymentProvider,
  parseProviderEvent,
  classifyEventType,
  computeSignature,
  signaturesMatch,
  type PaymentProvider,
} from '@/lib/billing/payment-webhook'
import { applyPaymentSuccess, applyPaymentFailure, type PaymentRow } from '@/lib/billing/payment-transitions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIGNATURE_HEADER = 'x-payment-signature'

function webhookSecret(provider: PaymentProvider): string | undefined {
  return provider === 'wave'
    ? process.env.WAVE_WEBHOOK_SECRET
    : process.env.ORANGE_MONEY_WEBHOOK_SECRET
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: providerRaw } = await ctx.params
  if (!isPaymentProvider(providerRaw)) {
    return Response.json({ ok: false, reason: 'unknown_provider' }, { status: 404 })
  }
  const provider = providerRaw

  const secret = webhookSecret(provider)
  if (!secret) {
    // Unsigned events are never trusted. 503 tells the provider to retry later,
    // once the secret is configured.
    return Response.json({ ok: false, reason: 'not_configured' }, { status: 503 })
  }

  // Read the EXACT bytes the provider signed.
  const rawBody = await req.text()
  const providedSig = req.headers.get(SIGNATURE_HEADER)
  const signatureValid = signaturesMatch(computeSignature(rawBody, secret), providedSig)

  const db = createAdminClient()
  const now = new Date().toISOString()

  // Reject (and record) a bad signature before parsing anything we'd act on.
  if (!signatureValid) {
    await recordEvent(db, {
      provider,
      event_id: `unsigned-${now}`,
      event_type: 'unknown',
      provider_ref: null,
      payment_id: null,
      clinic_id: null,
      signature_valid: false,
      outcome: 'rejected',
      payload: safeJson(rawBody),
    })
    return Response.json({ ok: false, reason: 'bad_signature' }, { status: 401 })
  }

  const event = parseProviderEvent(safeJson(rawBody))
  if (!event) {
    return Response.json({ ok: false, reason: 'bad_payload' }, { status: 400 })
  }

  // Idempotency: have we already seen this provider event id?
  const { data: existing } = await db
    .from('payment_events')
    .select('id')
    .eq('provider', provider)
    .eq('event_id', event.id)
    .maybeSingle()
  if (existing) {
    return Response.json({ ok: true, reason: 'duplicate' }, { status: 200 })
  }

  const outcome = classifyEventType(event.type)

  // Match the event to our pending payment by reference.
  const { data: paymentData } = await db
    .from('payments')
    .select('id, clinic_id, invoice_id, status, purpose, target_plan_id')
    .eq('provider_ref', event.reference)
    .maybeSingle()
  const payment = paymentData as PaymentRow | null

  if (!payment) {
    await recordEvent(db, {
      provider,
      event_id: event.id,
      event_type: event.type,
      provider_ref: event.reference,
      payment_id: null,
      clinic_id: null,
      signature_valid: true,
      outcome: 'unmatched',
      payload: safeJson(rawBody),
    })
    // 200 so the provider stops retrying a reference we don't own.
    return Response.json({ ok: true, reason: 'unmatched' }, { status: 200 })
  }

  // Already resolved? Record the event but don't re-apply the transition.
  const alreadyResolved = payment.status === 'succeeded' || payment.status === 'failed'

  if (!alreadyResolved && outcome === 'success') {
    await applyPaymentSuccess(db, payment, now)
  } else if (!alreadyResolved && outcome === 'failure') {
    await applyPaymentFailure(db, payment, `provider:${event.type}`, now)
  }

  await recordEvent(db, {
    provider,
    event_id: event.id,
    event_type: event.type,
    provider_ref: event.reference,
    payment_id: payment.id,
    clinic_id: payment.clinic_id,
    signature_valid: true,
    outcome: alreadyResolved ? 'duplicate' : outcome === 'ignore' ? 'ignored' : outcome,
    payload: safeJson(rawBody),
  })

  // Mirror confirmed/failed settlements into the immutable audit log (PHI-free).
  if (!alreadyResolved && outcome !== 'ignore') {
    try {
      await db.from('audit_logs').insert({
        user_id: null,
        clinic_id: payment.clinic_id,
        action: outcome === 'success' ? 'payment.confirmed' : 'payment.failed',
        entity_type: 'payment',
        entity_id: payment.id,
        metadata: { provider, eventType: event.type, via: 'webhook' },
      })
    } catch {
      /* audit must never block webhook processing */
    }
  }

  return Response.json({ ok: true, outcome }, { status: 200 })
}

type EventRecord = {
  provider: PaymentProvider
  event_id: string
  event_type: string
  provider_ref: string | null
  payment_id: string | null
  clinic_id: string | null
  signature_valid: boolean
  outcome: 'success' | 'failure' | 'ignored' | 'unmatched' | 'rejected' | 'duplicate'
  payload: unknown
}

async function recordEvent(db: ReturnType<typeof createAdminClient>, record: EventRecord): Promise<void> {
  try {
    await db.from('payment_events').insert(record)
  } catch {
    /* ledger write must never crash the handler; the response still reflects the outcome */
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
