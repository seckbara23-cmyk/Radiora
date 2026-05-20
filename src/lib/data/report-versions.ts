import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/user'

export interface ReportVersion {
  id: string
  reportId: string
  versionNumber: number
  findings: string
  impression: string
  recommendations: string | null
  status: string
  createdAt: string
  changeReason: string | null
  actorFirstName: string | null
  actorLastName: string | null
  actorRole: UserRole | null
}

export async function getReportVersions(reportId: string): Promise<ReportVersion[]> {
  const supabase = await createClient()

  const { data: versions } = await supabase
    .from('report_versions')
    .select('id, report_id, version_number, findings, impression, recommendations, status, created_by, created_at, change_reason')
    .eq('report_id', reportId)
    .order('version_number', { ascending: false })
    .limit(50)

  if (!versions || versions.length === 0) return []

  const actorIds = [...new Set(versions.map((v) => v.created_by).filter(Boolean))] as string[]
  const profileMap: Record<string, { firstName: string; lastName: string; role: UserRole }> = {}

  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role')
      .in('id', actorIds)

    for (const p of profiles ?? []) {
      profileMap[p.id as string] = {
        firstName: p.first_name as string,
        lastName:  p.last_name as string,
        role:      p.role as UserRole,
      }
    }
  }

  return versions.map((v) => {
    const actor = v.created_by ? (profileMap[v.created_by] ?? null) : null
    return {
      id:              v.id as string,
      reportId:        v.report_id as string,
      versionNumber:   v.version_number as number,
      findings:        v.findings as string,
      impression:      v.impression as string,
      recommendations: (v.recommendations as string | null) ?? null,
      status:          v.status as string,
      createdAt:       v.created_at as string,
      changeReason:    (v.change_reason as string | null) ?? null,
      actorFirstName:  actor?.firstName ?? null,
      actorLastName:   actor?.lastName ?? null,
      actorRole:       actor?.role ?? null,
    }
  })
}
