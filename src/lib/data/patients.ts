import { createClient } from '@/lib/supabase/server'
import type { Patient, PatientStatus } from '@/types/patient'

function mapPatient(row: Record<string, unknown>): Patient {
  return {
    id:          row.id as string,
    clinicId:    row.clinic_id as string,
    mrn:         row.mrn as string,
    firstName:   row.first_name as string,
    lastName:    row.last_name as string,
    dateOfBirth: row.date_of_birth as string,
    sex:         row.sex as Patient['sex'],
    email:       (row.email as string | null) ?? undefined,
    phone:       (row.phone as string | null) ?? undefined,
    status:      row.status as PatientStatus,
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  }
}

export async function getPatients(opts?: {
  search?: string
  status?: PatientStatus
}): Promise<Patient[]> {
  const supabase = await createClient()

  let query = supabase
    .from('patients')
    .select('id, clinic_id, mrn, first_name, last_name, date_of_birth, sex, email, phone, status, created_at, updated_at')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (opts?.status) {
    query = query.eq('status', opts.status)
  }

  if (opts?.search) {
    const term = opts.search.trim()
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,mrn.ilike.%${term}%`
    )
  }

  const { data } = await query
  return (data ?? []).map(mapPatient)
}

export async function getPatient(id: string): Promise<Patient | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patients')
    .select('id, clinic_id, mrn, first_name, last_name, date_of_birth, sex, email, phone, status, created_at, updated_at')
    .eq('id', id)
    .single()
  return data ? mapPatient(data) : null
}
