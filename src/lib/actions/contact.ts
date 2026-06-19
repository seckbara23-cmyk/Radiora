'use server'

// Phase 5H — public marketing contact / lead capture.
//
// Anyone on the public marketing site can send an inquiry. This action runs
// server-side and writes through the service-role client (the contact_messages
// table has RLS with no insert policy), but it is PUBLIC — so it re-validates
// every input and never trusts the browser. It captures business-contact data
// only; it must never be used for clinical content.

import { createAdminClient } from '@/lib/supabase/admin'
import { isValidEmail, normalizeEmail } from '@/lib/onboarding/signup'

export interface ContactState {
  ok?: boolean
  error?: string
}

const MAX_NAME = 120
const MAX_MESSAGE = 4000
const MAX_CLINIC = 160

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function submitContactInquiry(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const name    = clean(formData.get('name'), MAX_NAME)
  const email   = normalizeEmail(clean(formData.get('email'), MAX_NAME))
  const clinic  = clean(formData.get('clinic'), MAX_CLINIC)
  const message = clean(formData.get('message'), MAX_MESSAGE)
  const locale  = clean(formData.get('locale'), 8) || 'fr'

  if (!name || !message) return { error: 'missing_fields' }
  if (!isValidEmail(email)) return { error: 'invalid_email' }

  const db = createAdminClient()
  const { error } = await db.from('contact_messages').insert({
    name,
    email,
    clinic_name: clinic || null,
    message,
    locale: locale === 'en' ? 'en' : 'fr',
    source: 'marketing_contact',
  })
  if (error) return { error: 'failed' }

  // PHI-free lead audit (no authenticated user in a public flow).
  try {
    await db.from('audit_logs').insert({
      user_id: null,
      clinic_id: null,
      action: 'contact.submitted',
      entity_type: 'contact_message',
      entity_id: null,
      metadata: { source: 'marketing_contact', hasClinic: Boolean(clinic) },
    })
  } catch {
    /* audit must never block the inquiry */
  }

  return { ok: true }
}
