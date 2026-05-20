import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/user'

export interface AuditEntry {
  id: string
  clinicId: string | null
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  actorFirstName: string | null
  actorLastName: string | null
  actorRole: UserRole | null
}

export interface AuditFilters {
  entityType?: string
  limit?: number
}

export async function getAuditLogs(filters?: AuditFilters): Promise<AuditEntry[]> {
  const supabase = await createClient()

  let query = supabase
    .from('audit_logs')
    .select('id, clinic_id, user_id, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 200)

  if (filters?.entityType) {
    query = query.eq('entity_type', filters.entityType)
  }

  const { data: logs } = await query

  if (!logs || logs.length === 0) return []

  // Collect unique actor IDs for batch profile fetch
  const actorIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[]

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

  return logs.map((log) => {
    const actor = log.user_id ? (profileMap[log.user_id] ?? null) : null
    return {
      id:             log.id as string,
      clinicId:       (log.clinic_id as string | null) ?? null,
      userId:         (log.user_id as string | null) ?? null,
      action:         log.action as string,
      entityType:     log.entity_type as string,
      entityId:       (log.entity_id as string | null) ?? null,
      metadata:       (log.metadata as Record<string, unknown>) ?? {},
      createdAt:      log.created_at as string,
      actorFirstName: actor?.firstName ?? null,
      actorLastName:  actor?.lastName ?? null,
      actorRole:      actor?.role ?? null,
    }
  })
}
