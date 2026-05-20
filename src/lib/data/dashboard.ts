import { createClient } from '@/lib/supabase/server'
import type { Study } from '@/types/study'
import type { Report } from '@/types/report'

export interface DashboardStats {
  totalPatients: number
  pendingStudies: number
  urgentStudies: number
  draftReports: number
  finalizedReports: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()

  const [patients, pendingStudies, urgentStudies, draftReports, finalizedReports] =
    await Promise.all([
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('studies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('studies')
        .select('id', { count: 'exact', head: true })
        .eq('priority', 'urgent')
        .not('status', 'in', '("reported","validated","cancelled")'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
    ])

  return {
    totalPatients:    patients.count ?? 0,
    pendingStudies:   pendingStudies.count ?? 0,
    urgentStudies:    urgentStudies.count ?? 0,
    draftReports:     draftReports.count ?? 0,
    finalizedReports: finalizedReports.count ?? 0,
  }
}

function mapStudy(row: Record<string, unknown>): Study {
  return {
    id: row.id as string, clinicId: row.clinic_id as string,
    patientId: row.patient_id as string, accessionNumber: row.accession_number as string,
    modality: row.modality as Study['modality'], bodyPart: row.body_part as string,
    description: row.description as string, studyDate: row.study_date as string,
    referringPhysician: row.referring_physician as string, priority: row.priority as Study['priority'],
    status: row.status as Study['status'], hasReport: row.has_report as boolean,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

function mapReport(row: Record<string, unknown>): Report {
  return {
    id: row.id as string, clinicId: row.clinic_id as string,
    studyId: row.study_id as string, patientId: row.patient_id as string,
    authorId: row.author_id as string, status: row.status as Report['status'],
    findings: row.findings as string, impression: row.impression as string,
    signedAt: (row.signed_at as string | null) ?? undefined,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

export async function getRecentStudies(limit = 5): Promise<Study[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('studies')
    .select('id, clinic_id, patient_id, accession_number, modality, body_part, description, study_date, referring_physician, priority, status, has_report, created_at, updated_at')
    .order('study_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(mapStudy)
}

export async function getRecentReports(limit = 4): Promise<Report[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reports')
    .select('id, clinic_id, study_id, patient_id, author_id, status, findings, impression, recommendations, ai_draft, signed_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(mapReport)
}
