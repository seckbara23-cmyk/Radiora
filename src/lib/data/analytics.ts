import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'

// ── SLA targets (minutes) by priority ────────────────────────────────────────
const SLA_TARGETS: Record<string, number> = {
  stat:    60,
  urgent:  240,
  routine: 1440,
}

export type SlaStatus = 'on_time' | 'approaching_breach' | 'breached'

export function computeSlaStatus(
  priority: string,
  createdAt: string,
  slaDueAt: string | null,
  slaBreachedAt: string | null,
  studyStatus: string,
): SlaStatus {
  // Reported/validated studies are no longer subject to SLA
  if (['reported', 'validated', 'cancelled'].includes(studyStatus)) return 'on_time'
  if (slaBreachedAt) return 'breached'

  const now    = Date.now()
  const due    = slaDueAt
    ? new Date(slaDueAt).getTime()
    : new Date(createdAt).getTime() + (SLA_TARGETS[priority] ?? 1440) * 60_000

  if (now > due) return 'breached'
  if (due - now < 30 * 60_000) return 'approaching_breach'
  return 'on_time'
}

// ── Workload Stats ────────────────────────────────────────────────────────────

export interface WorkloadStats {
  studiesPending:    number
  studiesInReview:   number
  studiesReported:   number
  studiesValidated:  number
  studiesUrgent:     number
  studiesStat:       number
  draftReports:      number
  finalizedReports:  number
  finalizedToday:    number
  criticalOpen:      number
}

export async function getWorkloadStats(): Promise<WorkloadStats> {
  const supabase = await createClient()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const [
    pending, inReview, reported, validated,
    urgent, stat,
    draft, finalized, finalizedToday,
    criticalFindings,
  ] = await Promise.all([
    supabase.from('studies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('studies').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
    supabase.from('studies').select('id', { count: 'exact', head: true }).eq('status', 'reported'),
    supabase.from('studies').select('id', { count: 'exact', head: true }).eq('status', 'validated'),
    supabase.from('studies').select('id', { count: 'exact', head: true })
      .eq('priority', 'urgent').not('status', 'in', '("reported","validated","cancelled")'),
    supabase.from('studies').select('id', { count: 'exact', head: true })
      .eq('priority', 'stat').not('status', 'in', '("reported","validated","cancelled")'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
    supabase.from('reports').select('id', { count: 'exact', head: true })
      .eq('status', 'finalized').gte('signed_at', todayIso),
    supabase.from('critical_flags').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  return {
    studiesPending:   pending.count   ?? 0,
    studiesInReview:  inReview.count  ?? 0,
    studiesReported:  reported.count  ?? 0,
    studiesValidated: validated.count ?? 0,
    studiesUrgent:    urgent.count    ?? 0,
    studiesStat:      stat.count      ?? 0,
    draftReports:     draft.count     ?? 0,
    finalizedReports: finalized.count ?? 0,
    finalizedToday:   finalizedToday.count ?? 0,
    criticalOpen:     criticalFindings.count ?? 0,
  }
}

// ── TAT Analytics ────────────────────────────────────────────────────────────

export interface TatByModality {
  modality:    string
  avgMinutes:  number
  count:       number
}

export interface TatMetrics {
  overall:    { avgMinutes: number; count: number }
  byModality: TatByModality[]
}

export async function getTatMetrics(dayRange = 30): Promise<TatMetrics> {
  const supabase = await createClient()

  const since = new Date(Date.now() - dayRange * 86_400_000).toISOString()

  // Fetch finalized reports in range
  const { data: reports } = await supabase
    .from('reports')
    .select('id, study_id, signed_at, created_at')
    .eq('status', 'finalized')
    .not('signed_at', 'is', null)
    .gte('signed_at', since)
    .limit(500)

  if (!reports || reports.length === 0) {
    return { overall: { avgMinutes: 0, count: 0 }, byModality: [] }
  }

  const studyIds = [...new Set(reports.map((r) => r.study_id as string))]

  const { data: studies } = await supabase
    .from('studies')
    .select('id, modality, created_at')
    .in('id', studyIds)

  const studyMap: Record<string, { modality: string; createdAt: string }> = {}
  for (const s of studies ?? []) {
    studyMap[s.id as string] = {
      modality:  s.modality as string,
      createdAt: s.created_at as string,
    }
  }

  const modalityBuckets: Record<string, number[]> = {}
  const allMinutes: number[] = []

  for (const r of reports) {
    const study = studyMap[r.study_id as string]
    if (!study || !r.signed_at) continue

    const minutes = (new Date(r.signed_at as string).getTime() - new Date(study.createdAt).getTime()) / 60_000
    if (minutes <= 0) continue

    allMinutes.push(minutes)
    if (!modalityBuckets[study.modality]) modalityBuckets[study.modality] = []
    modalityBuckets[study.modality].push(minutes)
  }

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

  return {
    overall:    { avgMinutes: avg(allMinutes), count: allMinutes.length },
    byModality: Object.entries(modalityBuckets)
      .map(([modality, mins]) => ({ modality, avgMinutes: avg(mins), count: mins.length }))
      .sort((a, b) => b.count - a.count),
  }
}

// ── SLA Stats ────────────────────────────────────────────────────────────────

export interface SlaStats {
  onTime:           number
  approachingBreach: number
  breached:         number
  totalActive:      number
}

export async function getSlaStats(): Promise<SlaStats> {
  const supabase = await createClient()

  const { data: studies } = await supabase
    .from('studies')
    .select('priority, status, created_at, sla_due_at, sla_breached_at')
    .not('status', 'in', '("reported","validated","cancelled")')
    .limit(500)

  let onTime = 0, approaching = 0, breached = 0

  for (const s of studies ?? []) {
    const status = computeSlaStatus(
      s.priority as string,
      s.created_at as string,
      s.sla_due_at as string | null,
      s.sla_breached_at as string | null,
      s.status as string,
    )
    if (status === 'on_time')           onTime++
    if (status === 'approaching_breach') approaching++
    if (status === 'breached')           breached++
  }

  return {
    onTime,
    approachingBreach: approaching,
    breached,
    totalActive: onTime + approaching + breached,
  }
}

// ── Radiologist Productivity ──────────────────────────────────────────────────

export interface RadiologistProductivity {
  userId:          string
  firstName:       string
  lastName:        string
  totalReports:    number
  finalizedCount:  number
  draftCount:      number
  amendedCount:    number
  avgTatMinutes:   number | null
}

export async function getRadiologistProductivity(dayRange = 30): Promise<RadiologistProductivity[]> {
  const user     = await requireCurrentUser()
  const supabase = await createClient()

  const since = new Date(Date.now() - dayRange * 86_400_000).toISOString()

  let query = supabase
    .from('reports')
    .select('id, author_id, status, signed_at, created_at, study_id')
    .gte('updated_at', since)

  // Radiologists only see their own metrics unless admin
  if (user.role === 'radiologist') {
    query = query.eq('author_id', user.id)
  }

  const { data: reports } = await query.limit(1000)

  if (!reports || reports.length === 0) return []

  // Group by author
  const byAuthor: Record<string, {
    reports: typeof reports
    studyIds: string[]
  }> = {}

  for (const r of reports) {
    const aid = r.author_id as string
    if (!byAuthor[aid]) byAuthor[aid] = { reports: [], studyIds: [] }
    byAuthor[aid].reports.push(r)
    if (r.study_id) byAuthor[aid].studyIds.push(r.study_id as string)
  }

  const authorIds = Object.keys(byAuthor)

  // Fetch profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', authorIds)

  const profileMap: Record<string, { firstName: string; lastName: string }> = {}
  for (const p of profiles ?? []) {
    profileMap[p.id as string] = { firstName: p.first_name as string, lastName: p.last_name as string }
  }

  // Fetch study created_at for TAT computation
  const allStudyIds = [...new Set(reports.flatMap((r) => r.study_id ? [r.study_id as string] : []))]
  const { data: studies } = await supabase
    .from('studies')
    .select('id, created_at')
    .in('id', allStudyIds)

  const studyMap: Record<string, string> = {}
  for (const s of studies ?? []) studyMap[s.id as string] = s.created_at as string

  return authorIds.map((uid) => {
    const bucket  = byAuthor[uid]
    const profile = profileMap[uid]
    const finalized = bucket.reports.filter((r) => r.status === 'finalized')

    const tatMinutes: number[] = []
    for (const r of finalized) {
      if (!r.signed_at || !r.study_id) continue
      const studyCreated = studyMap[r.study_id as string]
      if (!studyCreated) continue
      const min = (new Date(r.signed_at as string).getTime() - new Date(studyCreated).getTime()) / 60_000
      if (min > 0) tatMinutes.push(min)
    }

    return {
      userId:         uid,
      firstName:      profile?.firstName ?? 'Unknown',
      lastName:       profile?.lastName  ?? '',
      totalReports:   bucket.reports.length,
      finalizedCount: finalized.length,
      draftCount:     bucket.reports.filter((r) => r.status === 'draft').length,
      amendedCount:   bucket.reports.filter((r) => r.status === 'amended').length,
      avgTatMinutes:  tatMinutes.length ? Math.round(tatMinutes.reduce((a, b) => a + b, 0) / tatMinutes.length) : null,
    }
  }).sort((a, b) => b.finalizedCount - a.finalizedCount)
}

// ── Critical Queue ────────────────────────────────────────────────────────────

export interface CriticalItem {
  id:          string
  type:        'ai_finding' | 'manual_flag'
  severity:    string
  label:       string
  studyId:     string | null
  reportId:    string | null
  description: string | null
  createdAt:   string
  status:      string
}

export async function getCriticalQueueItems(): Promise<CriticalItem[]> {
  const supabase = await createClient()

  const [aiFindingsRes, flagsRes] = await Promise.all([
    supabase
      .from('external_ai_findings')
      .select('id, finding_label, study_id, confidence, severity, recommendation, created_at, accepted, rejected_at')
      .eq('severity', 'critical')
      .is('accepted', null)
      .is('rejected_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('critical_flags')
      .select('id, severity, description, study_id, report_id, created_at, status, flag_type')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const items: CriticalItem[] = []

  for (const f of aiFindingsRes.data ?? []) {
    items.push({
      id:          f.id as string,
      type:        'ai_finding',
      severity:    'critical',
      label:       f.finding_label as string,
      studyId:     f.study_id as string | null,
      reportId:    null,
      description: (f.recommendation as string | null) ?? null,
      createdAt:   f.created_at as string,
      status:      'open',
    })
  }

  for (const flag of flagsRes.data ?? []) {
    items.push({
      id:          flag.id as string,
      type:        'manual_flag',
      severity:    flag.severity as string,
      label:       (flag.flag_type as string).replace(/_/g, ' '),
      studyId:     flag.study_id as string | null,
      reportId:    flag.report_id as string | null,
      description: flag.description as string | null,
      createdAt:   flag.created_at as string,
      status:      flag.status as string,
    })
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
