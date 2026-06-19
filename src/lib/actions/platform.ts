'use server'

// Phase 4B — Super Admin tenant lifecycle actions.
//
// All actions require super_admin and operate cross-tenant via the service-role
// client. They manage tenant + subscription METADATA only — never clinical
// content. Onboarding provisions a clinic, its first clinic_admin account, and
// a 30-day Professional trial in one atomic-ish flow with best-effort rollback.

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'

export type FormState = { error: string | null }
export type CreateTenantState = { error: string | null; clinicId?: string }

const TRIAL_DAYS = 30

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

// ── Create tenant (onboarding wizard) ─────────────────────────────────────────

export async function createTenant(
  _prev: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  const admin = await requireSuperAdmin()

  // Step 1 — clinic
  const name    = ((formData.get('clinic_name') as string) ?? '').trim()
  const city    = ((formData.get('city')        as string) ?? '').trim() || null
  const country = ((formData.get('country')     as string) ?? 'SN').trim() || 'SN'
  const phone   = ((formData.get('phone')       as string) ?? '').trim() || null
  const clinicEmail = ((formData.get('clinic_email') as string) ?? '').trim().toLowerCase() || null
  const slug    = slugify(((formData.get('slug') as string) ?? '').trim() || name)

  // Step 2 — admin account
  const firstName = ((formData.get('admin_first_name') as string) ?? '').trim()
  const lastName  = ((formData.get('admin_last_name')  as string) ?? '').trim()
  const email     = ((formData.get('admin_email')      as string) ?? '').trim().toLowerCase()
  const password  = ((formData.get('admin_password')   as string) ?? '')

  // Step 3 — branding (optional)
  const logoUrl      = ((formData.get('logo_url')      as string) ?? '').trim() || null
  const reportHeader = ((formData.get('report_header') as string) ?? '').trim() || null

  if (!name)               return { error: 'Le nom de la clinique est requis.' }
  if (!slug)               return { error: 'Identifiant (slug) invalide.' }
  if (!firstName)          return { error: 'Le prénom de l’administrateur est requis.' }
  if (!lastName)           return { error: 'Le nom de l’administrateur est requis.' }
  if (!email)              return { error: 'L’email de l’administrateur est requis.' }
  if (password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }

  const db = createAdminClient()

  // 1. Create the clinic (trial / Professional features).
  const { data: clinic, error: clinicError } = await db
    .from('clinics')
    .insert({
      name,
      slug,
      city,
      country,
      phone,
      email: clinicEmail,
      status: 'trial',
      plan: 'professional',
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      ...(reportHeader ? { report_header: reportHeader } : {}),
    })
    .select('id')
    .single()

  if (clinicError) {
    if (clinicError.code === '23505') return { error: 'Une clinique avec cet identifiant existe déjà.' }
    return { error: clinicError.message }
  }
  const clinicId = clinic.id as string

  // 2. Create the clinic_admin auth account (password set, email confirmed).
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  })

  if (userError || !created.user) {
    await db.from('clinics').delete().eq('id', clinicId) // rollback clinic
    const msg = userError?.message ?? ''
    if (msg.includes('already') && msg.includes('registered')) {
      return { error: 'Un utilisateur avec cet email existe déjà.' }
    }
    return { error: msg || 'Échec de la création du compte administrateur.' }
  }
  const userId = created.user.id

  // 3. Promote the trigger-created profile stub to clinic_admin of this clinic.
  const { error: profileError } = await db
    .from('profiles')
    .update({
      clinic_id:  clinicId,
      role:       'clinic_admin',
      first_name: firstName,
      last_name:  lastName,
      email,
      is_active:  true,
    })
    .eq('id', userId)

  if (profileError) {
    await db.auth.admin.deleteUser(userId)
    await db.from('clinics').delete().eq('id', clinicId)
    return { error: 'Échec de la configuration du compte administrateur.' }
  }

  // 4. Provision the 30-day Professional trial subscription.
  const now = new Date().toISOString()
  const { error: subError } = await db.from('subscriptions').insert({
    clinic_id:             clinicId,
    plan_id:               'professional',
    status:                'trial',
    trial_ends_at:         addDays(now, TRIAL_DAYS),
    current_period_start:  now,
  })

  if (subError) {
    await db.auth.admin.deleteUser(userId)
    await db.from('clinics').delete().eq('id', clinicId)
    return { error: 'Échec de la création de l’abonnement d’essai.' }
  }

  await logAudit({
    userId: admin.id,
    clinicId,
    action: 'tenant.created',
    entityType: 'clinic',
    entityId: clinicId,
    metadata: { name, slug, adminEmail: email, plan: 'professional', trialDays: TRIAL_DAYS },
  })

  revalidatePath('/admin/clinics')
  return { error: null, clinicId }
}

// ── Suspend / reactivate ──────────────────────────────────────────────────────

export async function suspendClinic(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSuperAdmin()
  const clinicId = ((formData.get('clinic_id') as string) ?? '').trim()
  if (!clinicId) return { error: 'Identifiant de clinique manquant.' }

  const db = createAdminClient()
  const { error: cErr } = await db.from('clinics').update({ status: 'suspended' }).eq('id', clinicId)
  if (cErr) return { error: cErr.message }
  await db.from('subscriptions').update({ status: 'suspended' }).eq('clinic_id', clinicId)

  await logAudit({
    userId: admin.id, clinicId,
    action: 'tenant.suspended', entityType: 'clinic', entityId: clinicId,
  })

  revalidatePath('/admin/clinics')
  revalidatePath(`/admin/clinics/${clinicId}`)
  return { error: null }
}

export async function reactivateClinic(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSuperAdmin()
  const clinicId = ((formData.get('clinic_id') as string) ?? '').trim()
  if (!clinicId) return { error: 'Identifiant de clinique manquant.' }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const { error: cErr } = await db.from('clinics').update({ status: 'active' }).eq('id', clinicId)
  if (cErr) return { error: cErr.message }

  await db
    .from('subscriptions')
    .update({
      status: 'active',
      grace_ends_at: null,
      current_period_start: now,
      current_period_end: addDays(now, 30),
    })
    .eq('clinic_id', clinicId)

  await logAudit({
    userId: admin.id, clinicId,
    action: 'tenant.reactivated', entityType: 'clinic', entityId: clinicId,
  })

  revalidatePath('/admin/clinics')
  revalidatePath(`/admin/clinics/${clinicId}`)
  return { error: null }
}
