'use server'

// Phase 5B — public self-service onboarding (no authentication required).
//
// Anyone on the marketing site can start a 30-day free trial. The flow:
//   1. account details  → 2. verify email (OTP)  → 3. verify phone (OTP)
//   4. clinic details   → 5. provision clinic + admin + trial.
//
// Provisioning is fully automatic (no platform-admin involvement). These actions
// run server-side and use the service-role client, but they are PUBLIC, so every
// one of them re-validates its inputs and enforces the verification gate and
// rate limits itself — never trusting the browser.
//
// VERIFICATION DELIVERY: codes are generated, salted-hashed (HMAC-SHA256 keyed
// on the server secret) and stored with a short TTL + bounded attempts. Actually
// SENDING the code over email/SMS is a documented stand-in — like the Phase 4
// Wave / Orange Money rails, the mechanism is production-correct but the last-mile
// delivery is wired to a real SMTP/SMS provider later. Until then, set
// ONBOARDING_OTP_ECHO=1 in a non-production environment to return the code to the
// client so the flow can be exercised end to end. It is OFF by default and the
// code is NEVER returned when the flag is unset.

import { createHmac, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
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
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  type VerificationChannel,
} from '@/lib/onboarding/signup'

const TRIAL_DAYS = 30
const RATE_WINDOW_MINUTES = 10
const RATE_MAX_PER_WINDOW = 5
const VERIFICATION_VALID_MINUTES = 30 // a consumed verification counts for the trial start

export type CodeRequestState = {
  error: string | null
  channel?: VerificationChannel
  masked?: string
  sent?: boolean
  /** Only populated when ONBOARDING_OTP_ECHO=1 (non-production stand-in). */
  devCode?: string
}
export type CodeVerifyState = { error: string | null; channel?: VerificationChannel; verified?: boolean }
export type StartTrialState = { error: string | null; slug?: string }

function hashCode(channel: string, email: string, code: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-secret'
  return createHmac('sha256', secret).update(`${channel}:${email}:${code}`).digest('hex')
}

function addMinutesISO(fromISO: string, minutes: number): string {
  return new Date(new Date(fromISO).getTime() + minutes * 60_000).toISOString()
}

function addDaysISO(fromISO: string, days: number): string {
  return new Date(new Date(fromISO).getTime() + days * 86_400_000).toISOString()
}

// ── 1. Request a verification code ──────────────────────────────────────────────

export async function requestSignupCode(
  _prev: CodeRequestState,
  formData: FormData,
): Promise<CodeRequestState> {
  const channelRaw = ((formData.get('channel') as string) ?? '').trim()
  const email = normalizeEmail((formData.get('email') as string) ?? '')
  const targetRaw = ((formData.get('target') as string) ?? '').trim()

  if (!isVerificationChannel(channelRaw)) return { error: 'Canal de vérification invalide.' }
  const channel = channelRaw
  if (!isValidEmail(email)) return { error: 'Adresse email invalide.' }

  // For the email channel the target IS the email; for phone, normalise it.
  let target = email
  let masked = email
  if (channel === 'phone') {
    const normalized = normalizeSenegalPhone(targetRaw)
    if (!normalized) return { error: 'Numéro de téléphone sénégalais invalide.' }
    target = normalized
    masked = maskPhone(normalized)
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  // Rate limit: at most RATE_MAX_PER_WINDOW codes per (email, channel) per window.
  const windowStart = addMinutesISO(now, -RATE_WINDOW_MINUTES)
  const { count } = await db
    .from('signup_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('channel', channel)
    .gte('created_at', windowStart)
  if ((count ?? 0) >= RATE_MAX_PER_WINDOW) {
    return { error: 'Trop de demandes. Réessayez dans quelques minutes.' }
  }

  // Cryptographically-random 6-digit code.
  const code = generateOtp(() => secureUnitRandom())
  const { error } = await db.from('signup_verifications').insert({
    email,
    channel,
    target,
    code_hash: hashCode(channel, email, code),
    expires_at: addMinutesISO(now, OTP_TTL_MINUTES),
  })
  if (error) return { error: 'Impossible d’envoyer le code. Réessayez.' }

  // Stand-in delivery: a real SMTP/SMS provider sends `code` to `target` here.
  const echo = process.env.ONBOARDING_OTP_ECHO === '1'
  return {
    error: null,
    channel,
    masked,
    sent: true,
    ...(echo ? { devCode: code } : {}),
  }
}

function secureUnitRandom(): number {
  // Crypto-strong float in [0, 1) from a 32-bit unsigned draw.
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000
}

// ── 2. Verify a code ────────────────────────────────────────────────────────────

export async function verifySignupCode(
  _prev: CodeVerifyState,
  formData: FormData,
): Promise<CodeVerifyState> {
  const channelRaw = ((formData.get('channel') as string) ?? '').trim()
  const email = normalizeEmail((formData.get('email') as string) ?? '')
  const code = ((formData.get('code') as string) ?? '').trim()

  if (!isVerificationChannel(channelRaw)) return { error: 'Canal de vérification invalide.' }
  const channel = channelRaw
  if (!isOtpCode(code)) return { error: 'Le code doit comporter 6 chiffres.' }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data } = await db
    .from('signup_verifications')
    .select('id, code_hash, expires_at, consumed_at, attempts, created_at')
    .eq('email', email)
    .eq('channel', channel)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const row = data as
    | { id: string; code_hash: string; expires_at: string; attempts: number; created_at: string }
    | null
  if (!row) return { error: 'Aucun code en attente. Demandez-en un nouveau.' }
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { error: 'Trop de tentatives. Demandez un nouveau code.' }
  if (isOtpExpired(row.created_at, now, OTP_TTL_MINUTES)) {
    return { error: 'Code expiré. Demandez-en un nouveau.' }
  }

  const expected = hashCode(channel, email, code)
  if (expected !== row.code_hash) {
    await db.from('signup_verifications').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    return { error: 'Code incorrect.' }
  }

  await db.from('signup_verifications').update({ consumed_at: now }).eq('id', row.id)
  return { error: null, channel, verified: true }
}

// ── 3. Provision clinic + admin + trial ─────────────────────────────────────────

export async function startFreeTrial(
  _prev: StartTrialState,
  formData: FormData,
): Promise<StartTrialState> {
  const firstName = ((formData.get('first_name') as string) ?? '').trim()
  const lastName = ((formData.get('last_name') as string) ?? '').trim()
  const email = normalizeEmail((formData.get('email') as string) ?? '')
  const password = (formData.get('password') as string) ?? ''
  const phoneRaw = ((formData.get('phone') as string) ?? '').trim()
  const clinicName = ((formData.get('clinic_name') as string) ?? '').trim()
  const city = ((formData.get('city') as string) ?? '').trim() || null
  const country = (((formData.get('country') as string) ?? 'SN').trim()) || 'SN'

  if (!firstName) return { error: 'Le prénom est requis.' }
  if (!lastName) return { error: 'Le nom est requis.' }
  if (!isValidEmail(email)) return { error: 'Adresse email invalide.' }
  if (passwordIssue(password)) return { error: 'Mot de passe trop faible (8+ caractères, lettres et chiffres).' }
  if (!clinicName) return { error: 'Le nom de la clinique est requis.' }
  const phone = normalizeSenegalPhone(phoneRaw)
  if (!phone) return { error: 'Numéro de téléphone invalide.' }

  const db = createAdminClient()
  const now = new Date().toISOString()
  const verifyWindowStart = addMinutesISO(now, -VERIFICATION_VALID_MINUTES)

  // Gate: both email AND phone must have a recently-consumed verification.
  const { data: verifs } = await db
    .from('signup_verifications')
    .select('channel')
    .eq('email', email)
    .not('consumed_at', 'is', null)
    .gte('consumed_at', verifyWindowStart)
  const channels = new Set(((verifs as { channel: string }[] | null) ?? []).map((v) => v.channel))
  if (!channels.has('email') || !channels.has('phone')) {
    return { error: 'Veuillez vérifier votre email et votre téléphone avant de continuer.' }
  }

  const slug = slugifyClinic(clinicName)
  if (!slug) return { error: 'Nom de clinique invalide.' }

  // 1. Create the clinic (trial / Professional features).
  const { data: clinic, error: clinicError } = await db
    .from('clinics')
    .insert({
      name: clinicName,
      slug,
      city,
      country,
      phone,
      email,
      status: 'trial',
      plan: 'professional',
    })
    .select('id')
    .single()
  if (clinicError) {
    if (clinicError.code === '23505') return { error: 'Une clinique avec ce nom existe déjà. Choisissez-en un autre.' }
    return { error: 'Impossible de créer la clinique. Réessayez.' }
  }
  const clinicId = clinic.id as string

  // 2. Create the clinic_admin account. Email control was just proven via OTP,
  //    so we confirm it immediately — the trial is usable with no manual step.
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, phone },
  })
  if (userError || !created.user) {
    await db.from('clinics').delete().eq('id', clinicId)
    const msg = userError?.message ?? ''
    if (msg.includes('already') && msg.includes('registered')) {
      return { error: 'Un compte existe déjà avec cet email. Connectez-vous.' }
    }
    return { error: 'Impossible de créer le compte. Réessayez.' }
  }
  const userId = created.user.id

  // 3. Promote the trigger-created profile stub to clinic_admin.
  const { error: profileError } = await db
    .from('profiles')
    .update({
      clinic_id: clinicId,
      role: 'clinic_admin',
      first_name: firstName,
      last_name: lastName,
      email,
      is_active: true,
    })
    .eq('id', userId)
  if (profileError) {
    await db.auth.admin.deleteUser(userId)
    await db.from('clinics').delete().eq('id', clinicId)
    return { error: 'Impossible de configurer le compte. Réessayez.' }
  }

  // 4. Provision the 30-day Professional trial.
  const { error: subError } = await db.from('subscriptions').insert({
    clinic_id: clinicId,
    plan_id: 'professional',
    status: 'trial',
    trial_ends_at: addDaysISO(now, TRIAL_DAYS),
    current_period_start: now,
  })
  if (subError) {
    await db.auth.admin.deleteUser(userId)
    await db.from('clinics').delete().eq('id', clinicId)
    return { error: 'Impossible de créer l’abonnement d’essai. Réessayez.' }
  }

  // Audit the self-provisioning with the new admin as the actor (service-role
  // insert; bypasses RLS). Never blocks the flow.
  try {
    await db.from('audit_logs').insert({
      user_id: userId,
      clinic_id: clinicId,
      action: 'tenant.self_onboarded',
      entity_type: 'clinic',
      entity_id: clinicId,
      metadata: { name: clinicName, slug, plan: 'professional', trialDays: TRIAL_DAYS, channel: 'self_service' },
    })
  } catch {
    /* audit must never block onboarding */
  }

  return { error: null, slug }
}
