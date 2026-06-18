'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import type { Modality } from '@/types/study'
import type { UserRole } from '@/types/user'
import type { VacationWorkflowStatus } from '@/types/vacation'

export type VacationActionResult = { error: string | null; id?: string }

// Clerical staff who can run the queue (create sessions/items, move clerical states).
const MANAGE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']
// Only these may move an item to validated/signed — physician authority.
const VALIDATE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'super_admin']

const MODALITIES: Modality[] = ['CT', 'MRI', 'XR', 'US', 'NM', 'PT', 'MG', 'DX', 'CR']
// An item must be at/after 'signed' before it can be printed or exported.
const POST_SIGN: VacationWorkflowStatus[] = ['signed', 'printed', 'exported']

function canManage(role: UserRole): boolean {
  return MANAGE_ROLES.includes(role)
}

// ─── createVacation ───────────────────────────────────────────────────────────

export async function createVacation(input: {
  title:          string
  modality:       Modality
  vacationDate:   string
  radiologistId?: string
  notes?:         string
}): Promise<VacationActionResult> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) {
    return { error: 'You do not have permission to create a vacation.' }
  }
  if (!user.clinicId) {
    return { error: 'A clinic context is required to create a vacation.' }
  }

  const title = input.title?.trim()
  if (!title)                                return { error: 'A title is required.' }
  if (!MODALITIES.includes(input.modality))  return { error: 'A valid modality is required.' }
  if (!input.vacationDate)                   return { error: 'A date is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vacations')
    .insert({
      clinic_id:      user.clinicId,
      radiologist_id: input.radiologistId || null,
      title,
      modality:       input.modality,
      vacation_date:  input.vacationDate,
      notes:          input.notes?.trim() || null,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'vacation.created',
    entityType: 'vacation',
    entityId:   data.id as string,
    metadata:   { modality: input.modality, date: input.vacationDate },
  })

  revalidatePath('/vacations')
  return { error: null, id: data.id as string }
}

// ─── addVacationItem ───────────────────────────────────────────────────────────

export async function addVacationItem(input: {
  vacationId:    string
  patientLabel?: string
  examNumber?:   string
}): Promise<VacationActionResult> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) {
    return { error: 'You do not have permission to add queue items.' }
  }
  if (!user.clinicId) {
    return { error: 'A clinic context is required.' }
  }
  if (!input.vacationId) return { error: 'Missing vacation.' }

  const supabase = await createClient()

  // Position = current item count within the vacation.
  const { count } = await supabase
    .from('vacation_items')
    .select('id', { count: 'exact', head: true })
    .eq('vacation_id', input.vacationId)

  const { data, error } = await supabase
    .from('vacation_items')
    .insert({
      clinic_id:       user.clinicId,
      vacation_id:     input.vacationId,
      patient_label:   input.patientLabel?.trim() || null,
      exam_number:     input.examNumber?.trim() || null,
      position:        count ?? 0,
      workflow_status: 'audio_received',
      created_by:      user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'vacation.item_added',
    entityType: 'vacation_item',
    entityId:   data.id as string,
    metadata:   { vacationId: input.vacationId },
  })

  revalidatePath('/vacations')
  revalidatePath(`/vacations/${input.vacationId}`)
  return { error: null, id: data.id as string }
}

// ─── setItemStatus ─────────────────────────────────────────────────────────────
// Enforces the medical-safety state machine in the action layer; the DB trigger
// enforce_vacation_validation_authority() backs the same rules as defence in depth.

export async function setItemStatus(input: {
  itemId: string
  status: VacationWorkflowStatus
}): Promise<{ error: string | null }> {
  const user = await requireCurrentUser()
  if (!canManage(user.role)) {
    return { error: 'You do not have permission to change queue status.' }
  }

  const supabase = await createClient()
  const { data: item } = await supabase
    .from('vacation_items')
    .select('id, vacation_id, workflow_status')
    .eq('id', input.itemId)
    .maybeSingle()

  if (!item) return { error: 'Queue item not found.' }

  const current = item.workflow_status as VacationWorkflowStatus

  // Physician authority: only radiologists/admins may validate or sign.
  if ((input.status === 'validated' || input.status === 'signed') && !VALIDATE_ROLES.includes(user.role)) {
    return { error: 'Only a radiologist can validate or sign a report.' }
  }

  // Validation-before-export: printing/exporting requires a signed report.
  if ((input.status === 'printed' || input.status === 'exported') && !POST_SIGN.includes(current)) {
    return { error: 'The report must be signed by a radiologist before it can be printed or exported.' }
  }

  const { error } = await supabase
    .from('vacation_items')
    .update({ workflow_status: input.status })
    .eq('id', input.itemId)

  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'vacation.item_status_changed',
    entityType: 'vacation_item',
    entityId:   input.itemId,
    metadata:   { from: current, to: input.status },
  })

  revalidatePath('/vacations')
  revalidatePath(`/vacations/${item.vacation_id as string}`)
  return { error: null }
}
