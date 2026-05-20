import { createClient } from '@/lib/supabase/server'
import type { Study, StudyStatus, StudyPriority, Modality } from '@/types/study'

function mapStudy(row: Record<string, unknown>): Study {
  return {
    id:                row.id as string,
    clinicId:          row.clinic_id as string,
    patientId:         row.patient_id as string,
    accessionNumber:   row.accession_number as string,
    modality:          row.modality as Modality,
    bodyPart:          row.body_part as string,
    description:       row.description as string,
    studyDate:         row.study_date as string,
    referringPhysician: row.referring_physician as string,
    priority:          row.priority as StudyPriority,
    status:            row.status as StudyStatus,
    hasReport:         row.has_report as boolean,
    createdAt:         row.created_at as string,
    updatedAt:         row.updated_at as string,
  }
}

export async function getStudies(opts?: {
  status?: StudyStatus
  priority?: StudyPriority
  modality?: Modality
}): Promise<Study[]> {
  const supabase = await createClient()

  let query = supabase
    .from('studies')
    .select('id, clinic_id, patient_id, accession_number, modality, body_part, description, study_date, referring_physician, priority, status, has_report, created_at, updated_at')
    .order('study_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.status)   query = query.eq('status',   opts.status)
  if (opts?.priority) query = query.eq('priority', opts.priority)
  if (opts?.modality) query = query.eq('modality', opts.modality)

  const { data } = await query
  return (data ?? []).map(mapStudy)
}

export async function getStudiesByPatient(patientId: string): Promise<Study[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('studies')
    .select('id, clinic_id, patient_id, accession_number, modality, body_part, description, study_date, referring_physician, priority, status, has_report, created_at, updated_at')
    .eq('patient_id', patientId)
    .order('study_date', { ascending: false })
  return (data ?? []).map(mapStudy)
}

export async function getStudy(id: string): Promise<Study | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('studies')
    .select('id, clinic_id, patient_id, accession_number, modality, body_part, description, study_date, referring_physician, priority, status, has_report, created_at, updated_at')
    .eq('id', id)
    .single()
  return data ? mapStudy(data) : null
}
