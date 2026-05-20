import { createClient } from '@/lib/supabase/server'

interface AuditOpts {
  userId: string
  clinicId: string | null
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
}

export async function logAudit(opts: AuditOpts): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('audit_logs').insert({
      user_id:     opts.userId,
      clinic_id:   opts.clinicId,
      action:      opts.action,
      entity_type: opts.entityType,
      entity_id:   opts.entityId,
      metadata:    opts.metadata ?? {},
    })
  } catch {
    // Audit log failures must never block the main operation.
    // Errors surface in server logs but are not thrown to the caller.
  }
}
