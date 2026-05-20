'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/actions/audit'
import type { UserRole } from '@/types/user'

export type FormState = { error: string | null }

// Roles a clinic_admin is permitted to assign — super_admin is excluded
const ASSIGNABLE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'technician', 'viewer']

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

  const adminClient = createAdminClient()

  // inviteUserByEmail creates an auth.users row (INVITED state) and fires the
  // handle_new_user trigger, which inserts the profile stub before returning.
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName },
      ...(process.env.NEXT_PUBLIC_SITE_URL
        ? { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login` }
        : {}),
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

  revalidatePath('/users')
  redirect('/users')
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
