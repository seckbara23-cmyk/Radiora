import { createClient } from '@/lib/supabase/server'
import type { Modality } from '@/types/study'
import type {
  Vacation,
  VacationItem,
  VacationStatus,
  VacationSummary,
  VacationQueueItem,
  VacationWorkflowStatus,
  ClinicRadiologist,
} from '@/types/vacation'
import { VACATION_WORKFLOW_ORDER } from '@/types/vacation'

const VACATION_SELECT =
  'id, clinic_id, radiologist_id, title, modality, vacation_date, status, notes, created_by, created_at, updated_at'

const ITEM_SELECT =
  'id, clinic_id, vacation_id, patient_id, study_id, report_id, patient_label, exam_number, position, workflow_status, assigned_secretary_id, assigned_radiologist_id, created_by, created_at, updated_at'

function mapVacation(row: Record<string, unknown>): Vacation {
  return {
    id:            row.id as string,
    clinicId:      row.clinic_id as string,
    radiologistId: (row.radiologist_id as string | null) ?? undefined,
    title:         row.title as string,
    modality:      row.modality as Modality,
    vacationDate:  row.vacation_date as string,
    status:        row.status as VacationStatus,
    notes:         (row.notes as string | null) ?? undefined,
    createdBy:     row.created_by as string,
    createdAt:     row.created_at as string,
    updatedAt:     row.updated_at as string,
  }
}

function mapItem(row: Record<string, unknown>): VacationItem {
  return {
    id:                    row.id as string,
    clinicId:              row.clinic_id as string,
    vacationId:            row.vacation_id as string,
    patientId:             (row.patient_id as string | null) ?? undefined,
    studyId:               (row.study_id as string | null) ?? undefined,
    reportId:              (row.report_id as string | null) ?? undefined,
    patientLabel:          (row.patient_label as string | null) ?? undefined,
    examNumber:            (row.exam_number as string | null) ?? undefined,
    position:              (row.position as number) ?? 0,
    workflowStatus:        row.workflow_status as VacationWorkflowStatus,
    assignedSecretaryId:   (row.assigned_secretary_id as string | null) ?? undefined,
    assignedRadiologistId: (row.assigned_radiologist_id as string | null) ?? undefined,
    createdBy:             row.created_by as string,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  }
}

function emptyCounts(): Record<VacationWorkflowStatus, number> {
  return Object.fromEntries(
    VACATION_WORKFLOW_ORDER.map((s) => [s, 0]),
  ) as Record<VacationWorkflowStatus, number>
}

// ─── Sessions list (with per-status breakdown + radiologist name) ─────────────

export async function getVacations(opts?: {
  date?:          string
  modality?:      Modality
  radiologistId?: string
  status?:        VacationStatus
}): Promise<VacationSummary[]> {
  const supabase = await createClient()

  let query = supabase
    .from('vacations')
    .select(VACATION_SELECT)
    .order('vacation_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.date)          query = query.eq('vacation_date', opts.date)
  if (opts?.modality)      query = query.eq('modality', opts.modality)
  if (opts?.radiologistId) query = query.eq('radiologist_id', opts.radiologistId)
  if (opts?.status)        query = query.eq('status', opts.status)

  const { data: rows } = await query
  const vacations = (rows ?? []).map(mapVacation)
  if (vacations.length === 0) return []

  const ids = vacations.map((v) => v.id)
  const radiologistIds = [...new Set(vacations.map((v) => v.radiologistId).filter(Boolean))] as string[]

  const [itemsRes, radsRes] = await Promise.all([
    supabase.from('vacation_items').select('vacation_id, workflow_status').in('vacation_id', ids),
    radiologistIds.length
      ? supabase.from('profiles').select('id, first_name, last_name').in('id', radiologistIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const countsByVacation: Record<string, Record<VacationWorkflowStatus, number>> = {}
  const totalByVacation:  Record<string, number> = {}
  for (const r of itemsRes.data ?? []) {
    const vid = r.vacation_id as string
    const st  = r.workflow_status as VacationWorkflowStatus
    countsByVacation[vid] ??= emptyCounts()
    countsByVacation[vid][st] = (countsByVacation[vid][st] ?? 0) + 1
    totalByVacation[vid] = (totalByVacation[vid] ?? 0) + 1
  }

  const radName: Record<string, string> = Object.fromEntries(
    (radsRes.data ?? []).map((p) => [p.id as string, `${p.first_name} ${p.last_name}`]),
  )

  return vacations.map((v) => ({
    ...v,
    itemCount:       totalByVacation[v.id] ?? 0,
    statusCounts:    countsByVacation[v.id] ?? emptyCounts(),
    radiologistName: v.radiologistId ? radName[v.radiologistId] : undefined,
  }))
}

export async function getVacation(id: string): Promise<Vacation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vacations')
    .select(VACATION_SELECT)
    .eq('id', id)
    .maybeSingle()
  return data ? mapVacation(data) : null
}

// ─── Queue items (joined with patient name + report status) ───────────────────
// Filters by date / modality / radiologist resolve through the parent vacation.

export async function getQueueItems(opts?: {
  vacationId?:    string
  date?:          string
  modality?:      Modality
  radiologistId?: string
  status?:        VacationWorkflowStatus
}): Promise<VacationQueueItem[]> {
  const supabase = await createClient()

  // Resolve the set of vacations in scope (so we can join their metadata and
  // honour date/modality/radiologist filters that live on the parent).
  let vacQuery = supabase.from('vacations').select('id, title, modality, vacation_date')
  if (opts?.vacationId)    vacQuery = vacQuery.eq('id', opts.vacationId)
  if (opts?.date)          vacQuery = vacQuery.eq('vacation_date', opts.date)
  if (opts?.modality)      vacQuery = vacQuery.eq('modality', opts.modality)
  if (opts?.radiologistId) vacQuery = vacQuery.eq('radiologist_id', opts.radiologistId)

  const { data: vacRows } = await vacQuery
  if (!vacRows || vacRows.length === 0) return []

  const vacMeta: Record<string, { title: string; modality: Modality; date: string }> =
    Object.fromEntries(
      vacRows.map((v) => [
        v.id as string,
        { title: v.title as string, modality: v.modality as Modality, date: v.vacation_date as string },
      ]),
    )

  let itemQuery = supabase
    .from('vacation_items')
    .select(ITEM_SELECT)
    .in('vacation_id', Object.keys(vacMeta))
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (opts?.status) itemQuery = itemQuery.eq('workflow_status', opts.status)

  const { data: itemRows } = await itemQuery
  const items = (itemRows ?? []).map(mapItem)
  if (items.length === 0) return []

  const patientIds = [...new Set(items.map((i) => i.patientId).filter(Boolean))] as string[]
  const reportIds  = [...new Set(items.map((i) => i.reportId).filter(Boolean))] as string[]

  const [patientsRes, reportsRes] = await Promise.all([
    patientIds.length
      ? supabase.from('patients').select('id, first_name, last_name').in('id', patientIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    reportIds.length
      ? supabase.from('reports').select('id, status').in('id', reportIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const patientName: Record<string, string> = Object.fromEntries(
    (patientsRes.data ?? []).map((p) => [p.id as string, `${p.last_name} ${p.first_name}`]),
  )
  const reportStatus: Record<string, string> = Object.fromEntries(
    (reportsRes.data ?? []).map((r) => [r.id as string, r.status as string]),
  )

  return items.map((i) => {
    const meta = vacMeta[i.vacationId]
    return {
      ...i,
      vacationTitle:    meta?.title ?? '',
      vacationModality: meta?.modality ?? ('CT' as Modality),
      vacationDate:     meta?.date ?? '',
      patientName:      i.patientId ? patientName[i.patientId] : undefined,
      reportStatus:     i.reportId ? reportStatus[i.reportId] : undefined,
    }
  })
}

// ─── Radiologists in the clinic (for the filter + session assignment) ─────────

export async function getClinicRadiologists(): Promise<ClinicRadiologist[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('role', 'radiologist')
    .eq('is_active', true)
    .order('last_name', { ascending: true })
  return (data ?? []).map((p) => ({
    id:        p.id as string,
    firstName: p.first_name as string,
    lastName:  p.last_name as string,
  }))
}
