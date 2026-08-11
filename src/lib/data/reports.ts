import { createClient } from '@/lib/supabase/server'
import type { Report, ReportStatus, StructuredReportData } from '@/types/report'

const REPORT_SELECT =
  'id, clinic_id, study_id, patient_id, author_id, status, findings, impression, recommendations, ai_draft, signed_at, structured_data, exam_type, created_at, updated_at'

function mapReport(row: Record<string, unknown>): Report {
  return {
    id:              row.id as string,
    clinicId:        row.clinic_id as string,
    studyId:         row.study_id as string,
    patientId:       row.patient_id as string,
    authorId:        row.author_id as string,
    status:          row.status as ReportStatus,
    findings:        (row.findings as string) ?? '',
    impression:      (row.impression as string) ?? '',
    recommendations: (row.recommendations as string | null) ?? undefined,
    aiDraft:         (row.ai_draft as string | null) ?? undefined,
    signedAt:        (row.signed_at as string | null) ?? undefined,
    createdAt:       row.created_at as string,
    updatedAt:       row.updated_at as string,
    structuredData:  (row.structured_data as StructuredReportData | null) ?? undefined,
    examType:        (row.exam_type as string | null) ?? undefined,
  }
}

export async function getReports(opts?: {
  status?: ReportStatus
}): Promise<Report[]> {
  const supabase = await createClient()
  let query = supabase
    .from('reports')
    .select(REPORT_SELECT)
    .order('created_at', { ascending: false })
  if (opts?.status) query = query.eq('status', opts.status)
  const { data } = await query
  return (data ?? []).map(mapReport)
}

export async function getReport(id: string): Promise<Report | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reports')
    .select(REPORT_SELECT)
    .eq('id', id)
    .single()
  return data ? mapReport(data) : null
}

export interface ReportListItem {
  id: string
  studyId: string
  patientId: string
  status: ReportStatus
  examType?: string
  createdAt: string
  updatedAt: string
  study: { modality: string; bodyPart: string; accessionNumber: string; studyDate: string } | null
  patient: { firstName: string; lastName: string; mrn: string } | null
  /** R2.1 — a secure delivery exists for this report. Drives the "Envoyé"
   *  display status. False for roles whose RLS hides report_deliveries. */
  delivered: boolean
}

/** R2.1 — retrieval is bounded. Supabase silently caps at 1000 rows, so an
 *  unbounded list would just start losing reports with no indication. */
export const REPORTS_PAGE_SIZE = 50

export async function getReportsList(opts?: {
  /** One or more internal statuses. Callers pass display-status groups. */
  statuses?: ReportStatus[]
  limit?: number
  offset?: number
}): Promise<ReportListItem[]> {
  const supabase = await createClient()
  const limit  = Math.min(Math.max(opts?.limit ?? REPORTS_PAGE_SIZE, 1), 200)
  const offset = Math.max(opts?.offset ?? 0, 0)

  let query = supabase
    .from('reports')
    .select('id, study_id, patient_id, status, exam_type, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (opts?.statuses?.length) query = query.in('status', opts.statuses)

  const { data: rows } = await query
  if (!rows || rows.length === 0) return []

  const studyIds   = [...new Set(rows.map((r) => r.study_id as string))]
  const patientIds = [...new Set(rows.map((r) => r.patient_id as string))]

  const reportIds = rows.map((r) => r.id as string)

  const [studiesRes, patientsRes, deliveriesRes] = await Promise.all([
    supabase
      .from('studies')
      .select('id, modality, body_part, accession_number, study_date')
      .in('id', studyIds),
    supabase
      .from('patients')
      .select('id, first_name, last_name, mrn')
      .in('id', patientIds),
    // Delivery presence only — never the token or password hash. RLS limits
    // this to the roles that may issue deliveries; others simply see "Signé".
    supabase
      .from('report_deliveries')
      .select('report_id')
      .in('report_id', reportIds)
      .is('revoked_at', null),
  ])

  const studyMap   = Object.fromEntries((studiesRes.data ?? []).map((s) => [s.id as string, s]))
  const patientMap = Object.fromEntries((patientsRes.data ?? []).map((p) => [p.id as string, p]))
  const deliveredIds = new Set((deliveriesRes.data ?? []).map((d) => d.report_id as string))

  return rows.map((r) => {
    const s = studyMap[r.study_id as string]
    const p = patientMap[r.patient_id as string]
    return {
      id:        r.id as string,
      studyId:   r.study_id as string,
      patientId: r.patient_id as string,
      status:    r.status as ReportStatus,
      examType:  (r.exam_type as string | null) ?? undefined,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      study:   s ? { modality: s.modality as string, bodyPart: s.body_part as string, accessionNumber: s.accession_number as string, studyDate: s.study_date as string } : null,
      patient: p ? { firstName: p.first_name as string, lastName: p.last_name as string, mrn: p.mrn as string } : null,
      delivered: deliveredIds.has(r.id as string),
    }
  })
}

export async function getReportByStudy(studyId: string): Promise<Report | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reports')
    .select(REPORT_SELECT)
    .eq('study_id', studyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapReport(data) : null
}
