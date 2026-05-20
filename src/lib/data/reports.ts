import { createClient } from '@/lib/supabase/server'
import type { Report, ReportStatus } from '@/types/report'

function mapReport(row: Record<string, unknown>): Report {
  return {
    id:              row.id as string,
    clinicId:        row.clinic_id as string,
    studyId:         row.study_id as string,
    patientId:       row.patient_id as string,
    authorId:        row.author_id as string,
    status:          row.status as ReportStatus,
    findings:        row.findings as string,
    impression:      row.impression as string,
    recommendations: (row.recommendations as string | null) ?? undefined,
    aiDraft:         (row.ai_draft as string | null) ?? undefined,
    signedAt:        (row.signed_at as string | null) ?? undefined,
    createdAt:       row.created_at as string,
    updatedAt:       row.updated_at as string,
  }
}

export async function getReports(opts?: {
  status?: ReportStatus
}): Promise<Report[]> {
  const supabase = await createClient()
  let query = supabase
    .from('reports')
    .select('id, clinic_id, study_id, patient_id, author_id, status, findings, impression, recommendations, ai_draft, signed_at, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (opts?.status) query = query.eq('status', opts.status)
  const { data } = await query
  return (data ?? []).map(mapReport)
}

export async function getReport(id: string): Promise<Report | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reports')
    .select('id, clinic_id, study_id, patient_id, author_id, status, findings, impression, recommendations, ai_draft, signed_at, created_at, updated_at')
    .eq('id', id)
    .single()
  return data ? mapReport(data) : null
}

export interface ReportListItem {
  id: string
  studyId: string
  patientId: string
  status: ReportStatus
  createdAt: string
  updatedAt: string
  study: { modality: string; bodyPart: string; accessionNumber: string } | null
  patient: { firstName: string; lastName: string; mrn: string } | null
}

export async function getReportsList(opts?: {
  status?: ReportStatus
}): Promise<ReportListItem[]> {
  const supabase = await createClient()

  let query = supabase
    .from('reports')
    .select('id, study_id, patient_id, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (opts?.status) query = query.eq('status', opts.status)

  const { data: rows } = await query
  if (!rows || rows.length === 0) return []

  const studyIds   = [...new Set(rows.map((r) => r.study_id as string))]
  const patientIds = [...new Set(rows.map((r) => r.patient_id as string))]

  const [studiesRes, patientsRes] = await Promise.all([
    supabase
      .from('studies')
      .select('id, modality, body_part, accession_number')
      .in('id', studyIds),
    supabase
      .from('patients')
      .select('id, first_name, last_name, mrn')
      .in('id', patientIds),
  ])

  const studyMap   = Object.fromEntries((studiesRes.data ?? []).map((s) => [s.id as string, s]))
  const patientMap = Object.fromEntries((patientsRes.data ?? []).map((p) => [p.id as string, p]))

  return rows.map((r) => {
    const s = studyMap[r.study_id as string]
    const p = patientMap[r.patient_id as string]
    return {
      id:        r.id as string,
      studyId:   r.study_id as string,
      patientId: r.patient_id as string,
      status:    r.status as ReportStatus,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      study:   s ? { modality: s.modality as string, bodyPart: s.body_part as string, accessionNumber: s.accession_number as string } : null,
      patient: p ? { firstName: p.first_name as string, lastName: p.last_name as string, mrn: p.mrn as string } : null,
    }
  })
}

export async function getReportByStudy(studyId: string): Promise<Report | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reports')
    .select('id, clinic_id, study_id, patient_id, author_id, status, findings, impression, recommendations, ai_draft, signed_at, created_at, updated_at')
    .eq('study_id', studyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapReport(data) : null
}
