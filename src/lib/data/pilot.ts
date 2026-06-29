import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getClinicAnalytics } from '@/lib/data/analytics'
import {
  confidenceDistribution,
  averageCorrections,
  completionRate,
  topDictationMethod,
  feedbackCounts,
  commonIssues,
  pilotRecommendations,
} from '@/lib/analytics/pilot-metrics'
import type {
  PilotFeedback,
  PilotMetrics,
  PilotReport,
  FeedbackCategory,
  FeedbackPriority,
} from '@/types/pilot'

// Phase 6A.5 — pilot instrumentation reads. All queries go through the session
// client so RLS confines every read to the caller's clinic. No clinical content
// leaves the tenant boundary; the pilot dashboard surfaces only aggregates.

const ADMIN_ROLES = ['clinic_admin', 'super_admin']

async function countAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actions: string[],
  since: string,
): Promise<number> {
  const { count } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .in('action', actions)
    .gte('created_at', since)
  return count ?? 0
}

// ── Pilot metrics (KPIs + session analytics + feedback summary) ───────────────
export async function getPilotMetrics(dayRange = 30): Promise<PilotMetrics> {
  const user = await requireCurrentUser()
  const supabase = await createClient()
  const since = new Date(Date.now() - dayRange * 86_400_000).toISOString()
  const nowISO = new Date().toISOString()

  // Reuse the established clinic analytics for throughput / validation / dictation.
  const clinic = await getClinicAnalytics(dayRange)

  // Reports by status in range → reports completed + completion rate.
  const [finalizedRes, totalRes] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true })
      .eq('status', 'finalized').not('signed_at', 'is', null).gte('signed_at', since),
    supabase.from('reports').select('id', { count: 'exact', head: true }).gte('updated_at', since),
  ])
  const reportsCompleted = finalizedRes.count ?? 0
  const totalReports = totalRes.count ?? 0

  // AI confidence distribution + average self-corrections from transcriptions.
  const { data: transcripts } = await supabase
    .from('transcriptions')
    .select('confidence, correction_events')
    .gte('created_at', since)
    .limit(5000)
  const levels: Array<string | null> = []
  const correctionCounts: number[] = []
  for (const t of transcripts ?? []) {
    const conf = (t.confidence as Array<{ confidence?: string }> | null) ?? []
    for (const c of conf) levels.push(c?.confidence ?? null)
    const events = (t.correction_events as unknown[] | null) ?? []
    if (Array.isArray(events)) correctionCounts.push(events.length)
  }
  const confidence = confidenceDistribution(levels)
  const avgCorrections = averageCorrections(correctionCounts)

  // Export usage (audited in the export routes / print action).
  const [pdfCount, docxCount, printCount] = await Promise.all([
    countAudit(supabase, ['pdf_exported'], since),
    countAudit(supabase, ['docx_exported'], since),
    countAudit(supabase, ['printed'], since),
  ])
  const exportCount = pdfCount + docxCount + printCount

  // Secure delivery count — secure links created in range (RLS-scoped table).
  const { count: deliveryCount } = await supabase
    .from('report_deliveries')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  const secureDeliveryCount = deliveryCount ?? 0

  // Dictation method split — file upload vs phone (QR) capture.
  const [uploadCount, mobileCount] = await Promise.all([
    countAudit(supabase, ['audio.uploaded'], since),
    countAudit(supabase, ['dictation.mobile_uploaded'], since),
  ])

  // Feedback summary (admins only — RLS returns nothing for other roles).
  const isAdmin = ADMIN_ROLES.includes(user.role)
  const { data: feedbackRows } = isAdmin
    ? await supabase
        .from('pilot_feedback')
        .select('id, category, priority, message, status, created_at, user_id')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)
    : { data: [] as Array<Record<string, unknown>> }

  const rows = (feedbackRows ?? []) as Array<{
    id: string; category: FeedbackCategory; priority: FeedbackPriority
    message: string; status: PilotFeedback['status']; created_at: string; user_id: string | null
  }>

  // Resolve author names for the recent list.
  const authorIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])]
  const nameMap: Record<string, string> = {}
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles').select('id, first_name, last_name').in('id', authorIds)
    for (const p of profiles ?? []) {
      nameMap[p.id as string] = `${(p.first_name as string) ?? ''} ${(p.last_name as string) ?? ''}`.trim()
    }
  }

  const counts = feedbackCounts(rows.map((r) => ({ category: r.category, priority: r.priority })))
  const recentFeedback: PilotFeedback[] = rows.slice(0, 8).map((r) => ({
    id: r.id,
    category: r.category,
    priority: r.priority,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    authorName: r.user_id ? (nameMap[r.user_id] || null) : null,
  }))

  const avgDictationSeconds = clinic.dictation.avgSeconds
  const validationMinutes = clinic.validationDelay.avgMinutes
  const turnaroundMinutes = clinic.turnaround.avgMinutes
  const completionRatePct = completionRate(reportsCompleted, totalReports)

  // Clinic name for the report header.
  let clinicName: string | null = null
  if (user.clinicId) {
    const { data: clinic2 } = await supabase
      .from('clinics').select('name').eq('id', user.clinicId).maybeSingle()
    clinicName = (clinic2?.name as string | undefined) ?? null
  }

  return {
    dayRange,
    generatedAt: nowISO,
    clinicName,
    kpis: {
      reportsCompleted,
      avgDictationSeconds,
      avgValidationMinutes: validationMinutes,
      avgCorrections,
      confidence,
      exportCount,
      secureDeliveryCount,
    },
    session: {
      dictationMinutes: Math.round((avgDictationSeconds / 60) * 10) / 10,
      validationMinutes,
      turnaroundMinutes,
      completionRatePct,
      dictationMethod: {
        mobile: mobileCount,
        upload: uploadCount,
        topMethod: topDictationMethod(mobileCount, uploadCount),
      },
      exportUsage: { pdf: pdfCount, docx: docxCount, print: printCount },
    },
    feedback: counts,
    recentFeedback,
  }
}

// ── Administrator pilot report (KPIs + feedback + recommendations) ────────────
export async function getPilotReport(dayRange = 30): Promise<PilotReport> {
  const metrics = await getPilotMetrics(dayRange)

  const recommendations = pilotRecommendations({
    criticalFeedback: metrics.feedback.byPriority.critical,
    confidence: metrics.kpis.confidence,
    avgCorrections: metrics.kpis.avgCorrections,
    avgValidationMinutes: metrics.kpis.avgValidationMinutes,
    completionRatePct: metrics.session.completionRatePct,
  })

  return {
    metrics,
    commonIssues: commonIssues(metrics.feedback.byCategory),
    recommendations,
  }
}
