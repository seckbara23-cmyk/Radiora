'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'

export type HeaderFormState = { error: string | null; saved?: boolean }

const MANAGE_ROLES = ['super_admin', 'clinic_admin'] as const
type ManageRole = typeof MANAGE_ROLES[number]
const BRANDING_BUCKET = 'clinic-branding'
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function canManage(role: string): role is ManageRole {
  return (MANAGE_ROLES as readonly string[]).includes(role)
}

function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string) ?? '').trim()
}

// Upload a header logo to the clinic-branding bucket (path = clinic_id/headers/…).
// Returns the stored path, '' if no file, or an Error message string on failure.
async function uploadLogo(
  formData: FormData,
  clinicId: string,
): Promise<{ path: string } | { error: string }> {
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { path: '' }
  if (!LOGO_TYPES.includes(file.type)) {
    return { error: 'Le logo doit être au format PNG, JPEG ou WebP.' }
  }
  if (file.size > 2 * 1024 * 1024) {
    return { error: 'Logo trop volumineux (max 2 Mo).' }
  }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  // Path's first segment must be the clinic_id (bucket is scoped by it).
  const safeName = str(formData, 'name').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'header'
  const path = `${clinicId}/headers/${safeName}-${file.size}.${ext}`

  const supabase = await createClient()
  const { error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) return { error: error.message }
  return { path }
}

export async function addHospitalHeader(
  _prev: HeaderFormState,
  formData: FormData,
): Promise<HeaderFormState> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'Permission refusée.' }

  const name = str(formData, 'name')
  if (!name) return { error: 'Le nom de l’établissement est obligatoire.' }

  const logo = await uploadLogo(formData, user.clinicId ?? '')
  if ('error' in logo) return { error: logo.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('hospital_headers')
    .insert({
      clinic_id:  user.clinicId,
      name,
      overline:   str(formData, 'overline'),
      department: str(formData, 'department'),
      subtitle:   str(formData, 'subtitle'),
      address:    str(formData, 'address'),
      phone:      str(formData, 'phone'),
      email:      str(formData, 'email'),
      logo_url:   logo.path || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'hospital_header.created', entityType: 'hospital_header', entityId: data.id,
    metadata: { name },
  })

  revalidatePath('/settings/headers')
  return { error: null, saved: true }
}

export async function toggleHospitalHeader(
  _prev: HeaderFormState,
  formData: FormData,
): Promise<HeaderFormState> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'Permission refusée.' }

  const id = str(formData, 'id')
  const activate = formData.get('activate') === '1'
  if (!id) return { error: 'Identifiant manquant.' }

  const supabase = await createClient()
  // RLS ensures only the clinic's own (non-global) rows can be updated.
  const { error } = await supabase
    .from('hospital_headers')
    .update({ is_active: activate })
    .eq('id', id)

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: activate ? 'hospital_header.activated' : 'hospital_header.deactivated',
    entityType: 'hospital_header', entityId: id,
  })

  revalidatePath('/settings/headers')
  return { error: null }
}

export async function deleteHospitalHeader(
  _prev: HeaderFormState,
  formData: FormData,
): Promise<HeaderFormState> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) return { error: 'Permission refusée.' }

  const id = str(formData, 'id')
  if (!id) return { error: 'Identifiant manquant.' }

  const supabase = await createClient()
  const { error } = await supabase.from('hospital_headers').delete().eq('id', id)
  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'hospital_header.deleted', entityType: 'hospital_header', entityId: id,
  })

  revalidatePath('/settings/headers')
  return { error: null }
}
