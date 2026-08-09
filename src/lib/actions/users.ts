'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/actions/audit'
import { ASSIGNABLE_CLINIC_ROLES } from '@/lib/safety/authority'
import type { UserRole } from '@/types/user'

export type FormState = { error: string | null; submitted?: boolean }

// Roles a clinic_admin is permitted to assign — super_admin is excluded.
// R0.7: the list moved to lib/safety/authority.ts (the pure single source of
// truth for role rules) so it is unit-testable and cannot drift from the UI.
// 'secretary' had been missing since migration 016 added it to the enum, which
// left clinics unable to provision the role the dictation workflow depends on.
const ASSIGNABLE_ROLES: UserRole[] = ASSIGNABLE_CLINIC_ROLES

// Where Supabase should send the invitee after they click the email link. This
// MUST be the dedicated invite-acceptance route (NOT /login): /login bounces an
// already-authenticated visitor straight to their dashboard, so an admin who
// opens the link in their own browser would silently land in their own session
// instead of accepting the invite. The accept-invite route processes the invited
// tokens, warns on a session conflict, and sets the new password.
// (The URL must be whitelisted in Supabase Auth → URL Configuration.)
function inviteRedirectUrl(locale: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_SITE_URL
  if (!base) return undefined
  return `${base.replace(/\/$/, '')}/${locale}/accept-invite`
}

// ── Invite user ───────────────────────────────────────────────────────────────

export async function inviteUser(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const currentUser = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(currentUser.role)) {
    return { error: 'You do not have permission to invite users.' }
  }

  // clinic_admin must have a clinicId; super_admin must pass one explicitly
  const clinicId =
    currentUser.role === 'super_admin'
      ? ((formData.get('clinic_id') as string | null) ?? currentUser.clinicId)
      : currentUser.clinicId

  if (!clinicId) {
    return { error: 'No clinic associated with your account.' }
  }

  const email      = ((formData.get('email')          as string) ?? '').trim().toLowerCase()
  const firstName  = ((formData.get('first_name')     as string) ?? '').trim()
  const lastName   = ((formData.get('last_name')      as string) ?? '').trim()
  const role       = ((formData.get('role')           as string) ?? '').trim() as UserRole
  const specialty  = ((formData.get('specialty')      as string | null) ?? '').trim() || null
  const licenseNum = ((formData.get('license_number') as string | null) ?? '').trim() || null

  if (!email)                            return { error: 'Email address is required.' }
  if (!firstName)                        return { error: 'First name is required.' }
  if (!lastName)                         return { error: 'Last name is required.' }
  if (!ASSIGNABLE_ROLES.includes(role))  return { error: 'Please select a valid role.' }

  // Hard server-side guard: clinic_admin cannot escalate to super_admin
  if (currentUser.role === 'clinic_admin' && role === 'super_admin') {
    return { error: 'You cannot assign the Super Admin role.' }
  }

  const locale = await getLocale().catch(() => 'fr')
  const redirectTo = inviteRedirectUrl(locale)
  const adminClient = createAdminClient()

  // inviteUserByEmail creates an auth.users row (INVITED state) and fires the
  // handle_new_user trigger, which inserts the profile stub before returning.
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName },
      ...(redirectTo ? { redirectTo } : {}),
    })

  if (inviteError) {
    const msg = inviteError.message
    if (msg.includes('already been registered') || msg.includes('already registered')) {
      return { error: 'A user with this email address already exists.' }
    }
    return { error: msg }
  }

  const userId = inviteData.user?.id
  if (!userId) return { error: 'Invitation failed — no user ID returned.' }

  // Update the profile stub (created by handle_new_user trigger) with clinic
  // details, role, and personal info.  Use admin client so RLS is bypassed —
  // the row was just inserted and doesn't yet have a clinic_id.
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      clinic_id:      clinicId,
      role,
      first_name:     firstName,
      last_name:      lastName,
      email,
      specialty,
      license_number: licenseNum,
      is_active:      true,
    })
    .eq('id', userId)

  if (profileError) {
    // Best-effort rollback — prevent orphaned auth user
    await adminClient.auth.admin.deleteUser(userId)
    return { error: 'Failed to configure user profile. Please try again.' }
  }

  await logAudit({
    userId: currentUser.id,
    clinicId,
    action: 'user.invited',
    entityType: 'profile',
    entityId: userId,
    metadata: { email, role, name: `${firstName} ${lastName}` },
  })

  // Keep the inviter authenticated and return them to the Users list (NOT the
  // public landing page). Redirect to the locale-prefixed path so middleware /
  // next-intl resolve it to the dashboard route, with a success flag the page
  // turns into "Invitation envoyée à <email>".
  revalidatePath(`/${locale}/users`)
  redirect(`/${locale}/users?invited=${encodeURIComponent(email)}`)
}

// ── Resend invitation ─────────────────────────────────────────────────────────

export async function resendInvite(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const currentUser = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(currentUser.role)) {
    return { error: 'You do not have permission to resend invitations.' }
  }

  const userId = ((formData.get('user_id') as string) ?? '').trim()
  if (!userId) return { error: 'Missing user ID.' }

  const adminClient = createAdminClient()

  // Look up the target profile (service role) and enforce tenant isolation:
  // a clinic_admin may only resend within their own clinic.
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('email, clinic_id, first_name, last_name')
    .eq('id', userId)
    .single()

  if (profileError || !profile?.email) {
    return { error: 'User not found.' }
  }
  if (currentUser.role === 'clinic_admin' && profile.clinic_id !== currentUser.clinicId) {
    return { error: 'You can only resend invitations within your own clinic.' }
  }

  const locale = await getLocale().catch(() => 'fr')
  const redirectTo = inviteRedirectUrl(locale)
  const email = profile.email as string

  // Re-issue the invitation. inviteUserByEmail refuses an already-registered
  // address, so for an existing (still-unconfirmed) invitee we regenerate the
  // invite link instead — this mints a fresh token and resets the 24h expiry.
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { first_name: profile.first_name, last_name: profile.last_name },
    ...(redirectTo ? { redirectTo } : {}),
  })

  if (inviteError) {
    const msg = inviteError.message
    if (msg.includes('already been registered') || msg.includes('already registered')) {
      const { error: genError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        ...(redirectTo ? { options: { redirectTo } } : {}),
      })
      if (genError) return { error: genError.message }
    } else {
      return { error: msg }
    }
  }

  await logAudit({
    userId: currentUser.id,
    clinicId: currentUser.role === 'super_admin' ? (profile.clinic_id as string | null) : currentUser.clinicId,
    action: 'user.invite_resent',
    entityType: 'profile',
    entityId: userId,
    metadata: { email },
  })

  revalidatePath(`/${locale}/users`)
  return { error: null, submitted: true }
}

// ── Invitation lifecycle audit events ─────────────────────────────────────────
//
// These run in the INVITED user's own session (the accept-invite client calls
// them after it has set the invited session). The RLS policy
// "audit_logs: users insert own" (with check user_id = auth.uid()) lets the
// invitee append their own lifecycle rows; the dedupe lookup uses the admin
// client because invitees cannot SELECT the audit trail (admin-only read).

// Resolve the invited user's clinic for the audit row (best-effort).
async function inviteeClinicId(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', userId)
      .single()
    return (data?.clinic_id as string | null) ?? null
  } catch {
    return null
  }
}

// Fired when an invited user reaches /accept-invite with a valid token and the
// invited session has been adopted. Recorded once per invitation (deduped on the
// existing user.invite_opened row for this user).
export async function recordInviteOpened(): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Only record once per invitation. The invitee cannot read audit_logs, so
    // the existence check goes through the service-role client.
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('audit_logs')
      .select('id')
      .eq('entity_id', user.id)
      .eq('action', 'user.invite_opened')
      .limit(1)
    if (existing && existing.length > 0) return

    await logAudit({
      userId: user.id,
      clinicId: await inviteeClinicId(user.id),
      action: 'user.invite_opened',
      entityType: 'profile',
      entityId: user.id,
      metadata: { email: user.email ?? null },
    })
  } catch {
    // Lifecycle audit is best-effort and must never block invite acceptance.
  }
}

// Fired immediately after the invitee sets their password / activates the
// account. Logged in their own session (user_id = auth.uid()).
export async function recordInviteAccepted(): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await logAudit({
      userId: user.id,
      clinicId: await inviteeClinicId(user.id),
      action: 'user.invite_accepted',
      entityType: 'profile',
      entityId: user.id,
      metadata: { email: user.email ?? null },
    })
  } catch {
    // Best-effort — never block account activation on an audit write.
  }
}

// ── Activate / deactivate ─────────────────────────────────────────────────────

export async function setUserStatus(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const currentUser = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(currentUser.role)) {
    return { error: 'You do not have permission to change user status.' }
  }

  const userId   = ((formData.get('user_id')  as string) ?? '').trim()
  const activate =  (formData.get('activate') as string) === '1'

  if (!userId) return { error: 'Missing user ID.' }

  if (userId === currentUser.id) {
    return { error: 'You cannot change the status of your own account.' }
  }

  // Use the regular (RLS-enforced) client for updates — the new
  // "profiles: clinic_admin update clinic" policy prevents cross-clinic
  // writes and role escalation at the database level.
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: activate })
    .eq('id', userId)

  if (error) return { error: error.message }

  await logAudit({
    userId: currentUser.id,
    clinicId: currentUser.clinicId,
    action: activate ? 'user.reactivated' : 'user.deactivated',
    entityType: 'profile',
    entityId: userId,
  })

  revalidatePath('/users')
  return { error: null }
}
