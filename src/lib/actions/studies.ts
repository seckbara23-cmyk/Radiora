'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { clinicCanWrite, READ_ONLY_MESSAGE } from '@/lib/billing/access'

export type FormState = { error: string | null }

const WRITE_ROLES = ['super_admin', 'clinic_admin', 'radiologist', 'technician'] as const

function generateAccessionNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const suffix = Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `ACC-${date}-${suffix}`
}

export async function createStudy(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!WRITE_ROLES.includes(user.role as typeof WRITE_ROLES[number])) {
    return { error: 'You do not have permission to create studies.' }
  }
  if (!user.clinicId) {
    return { error: 'Super-admin accounts must be linked to a clinic before creating studies.' }
  }
  if (!(await clinicCanWrite(user.clinicId))) {
    return { error: READ_ONLY_MESSAGE }
  }

  const patientId  = (formData.get('patient_id')  as string).trim()
  const modality   = (formData.get('modality')     as string).trim()
  const bodyPart   = (formData.get('body_part')    as string).trim()
  const studyDate  = (formData.get('study_date')   as string).trim()
  const priority   = (formData.get('priority')     as string).trim()
  const description = (formData.get('description') as string).trim()

  if (!patientId)  return { error: 'Patient is required.' }
  if (!modality)   return { error: 'Modality is required.' }
  if (!bodyPart)   return { error: 'Body part is required.' }
  if (!studyDate)  return { error: 'Study date is required.' }
  if (!priority)   return { error: 'Priority is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('studies')
    .insert({
      clinic_id:          user.clinicId,
      patient_id:         patientId,
      accession_number:   generateAccessionNumber(),
      modality,
      body_part:          bodyPart,
      description:        description || `${modality} ${bodyPart}`,
      study_date:         studyDate,
      referring_physician: (formData.get('referring_physician') as string | null)?.trim() || '',
      priority,
      status:             'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Accession number collision — please try again.' }
    return { error: error.message }
  }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'study.created', entityType: 'study', entityId: data.id,
    metadata: { modality, bodyPart, patientId },
  })

  revalidatePath('/studies')
  revalidatePath(`/patients/${patientId}`)
  redirect(`/studies/${data.id}`)
}

export async function updateStudyStatus(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!WRITE_ROLES.includes(user.role as typeof WRITE_ROLES[number])) {
    return { error: 'You do not have permission to update study status.' }
  }

  const id     = (formData.get('id')     as string).trim()
  const status = (formData.get('status') as string).trim()

  if (!id || !status) return { error: 'Missing required fields.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('studies')
    .update({ status })
    .eq('id', id)

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'study.status_updated', entityType: 'study', entityId: id,
    metadata: { status },
  })

  revalidatePath(`/studies/${id}`)
  revalidatePath('/studies')
  redirect(`/studies/${id}`)
}
