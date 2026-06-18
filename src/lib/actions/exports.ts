'use server'

// Feature 9 — export-related audit actions.
//
// PDF/DOCX exports are audited inside their route handlers (they own the byte
// stream). Printing happens in the browser via window.print(), so the print page
// calls this action to record the 'printed' event. RLS on getReport ensures the
// caller may only log prints for a report in their own clinic.

import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReport } from '@/lib/data/reports'
import { logAudit } from '@/lib/actions/audit'

export async function logReportPrinted(reportId: string): Promise<void> {
  const user = await requireCurrentUser()
  const report = await getReport(reportId)
  if (!report) return

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'printed',
    entityType: 'report',
    entityId: reportId,
    metadata: { status: report.status },
  })
}
