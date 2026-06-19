'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { coerceSignatureStyle, TITLE_PREFIXES } from '@/lib/profile/signature'

export type ProfileFormState = { error: string | null; saved?: boolean }

function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string) ?? '').trim()
}

// F11 — a radiologist updates their own identity + signature preferences.
// RLS scopes the UPDATE to the caller's own profile row (eq id = user.id), so a
// user can never write another person's profile even by tampering with the form.
export async function updateMyProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireCurrentUser()

  const firstName = str(formData, 'first_name')
  const lastName = str(formData, 'last_name')
  if (!firstName || !lastName) {
    return { error: 'Le nom et le(s) prénom(s) sont obligatoires.' }
  }

  const rawPrefix = str(formData, 'title_prefix')
  const titlePrefix = (TITLE_PREFIXES as readonly string[]).includes(rawPrefix) ? rawPrefix : 'Dr'
  const signatureStyle = coerceSignatureStyle(str(formData, 'signature_style'))
  const signatureCustom = str(formData, 'signature_custom')

  if (signatureStyle === 'custom' && !signatureCustom) {
    return { error: 'Saisissez le texte de signature personnalisé.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      first_name:       firstName,
      last_name:        lastName,
      title_prefix:     titlePrefix,
      signature_style:  signatureStyle,
      signature_custom: signatureCustom,
      signature_title:  str(formData, 'signature_title'),
      specialty:        str(formData, 'specialty'),
      license_number:   str(formData, 'license_number'),
      phone:            str(formData, 'phone'),
      institution:      str(formData, 'institution'),
      country:          str(formData, 'country'),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'profile.updated',
    entityType: 'profile',
    entityId: user.id,
    metadata: { signatureStyle, titlePrefix },
  })

  revalidatePath('/settings/profile')
  return { error: null, saved: true }
}
