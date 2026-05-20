'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'

export type FormState = { error: string | null }

const WRITE_ROLES = ['super_admin', 'clinic_admin', 'radiologist', 'technician'] as const

export async function createPatient(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!WRITE_ROLES.includes(user.role as typeof WRITE_ROLES[number])) {
    return { error: 'You do not have permission to create patients.' }
  }
  if (!user.clinicId) {
    return { error: 'Super-admin accounts must be linked to a clinic before creating patients.' }
  }

  const firstName = (formData.get('first_name') as string).trim()
  const lastName  = (formData.get('last_name')  as string).trim()
  const mrn       = (formData.get('mrn')         as string).trim()
  const dob       = (formData.get('date_of_birth') as string).trim()
  const sex       = (formData.get('sex')          as string).trim()

  if (!firstName) return { error: 'First name is required.' }
  if (!lastName)  return { error: 'Last name is required.' }
  if (!mrn)       return { error: 'Medical record number is required.' }
  if (!dob)       return { error: 'Date of birth is required.' }
  if (!sex)       return { error: 'Sex is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id:     user.clinicId,
      first_name:    firstName,
      last_name:     lastName,
      mrn,
      date_of_birth: dob,
      sex,
      phone:         (formData.get('phone') as string | null)?.trim() || null,
      email:         (formData.get('email') as string | null)?.trim() || null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'A patient with this MRN already exists in your clinic.' }
    return { error: error.message }
  }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'patient.created', entityType: 'patient', entityId: data.id,
    metadata: { mrn, name: `${firstName} ${lastName}` },
  })

  revalidatePath('/patients')
  redirect(`/patients/${data.id}`)
}

export async function updatePatient(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!WRITE_ROLES.includes(user.role as typeof WRITE_ROLES[number])) {
    return { error: 'You do not have permission to edit patients.' }
  }

  const id        = (formData.get('id')           as string).trim()
  const firstName = (formData.get('first_name')   as string).trim()
  const lastName  = (formData.get('last_name')    as string).trim()
  const dob       = (formData.get('date_of_birth') as string).trim()
  const sex       = (formData.get('sex')           as string).trim()

  if (!id)        return { error: 'Missing patient ID.' }
  if (!firstName) return { error: 'First name is required.' }
  if (!lastName)  return { error: 'Last name is required.' }
  if (!dob)       return { error: 'Date of birth is required.' }
  if (!sex)       return { error: 'Sex is required.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('patients')
    .update({
      first_name:    firstName,
      last_name:     lastName,
      date_of_birth: dob,
      sex,
      phone:  (formData.get('phone') as string | null)?.trim() || null,
      email:  (formData.get('email') as string | null)?.trim() || null,
      status: (formData.get('status') as string).trim(),
    })
    .eq('id', id)
    // RLS USING + WITH CHECK ensures this is the user's clinic's patient

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'patient.updated', entityType: 'patient', entityId: id,
  })

  revalidatePath(`/patients/${id}`)
  revalidatePath('/patients')
  redirect(`/patients/${id}`)
}
