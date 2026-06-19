// Phase 5G — Radiologist Productivity PDF export.
//   GET /api/analytics/productivity/pdf?days=30 → application/pdf
//
// A clinic_admin / super_admin exports every radiologist; a radiologist
// exports only their own row (enforced in getRadiologistProductivityReport via
// session-client RLS). Other roles are denied. The PDF carries operational
// metrics only — names, counts, durations — never clinical content.

import type { NextRequest } from 'next/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getRadiologistProductivityReport } from '@/lib/data/analytics'
import { renderProductivityPdf } from '@/lib/export/productivity-pdf'
import { fileResponse } from '@/lib/export/http'
import { logAudit } from '@/lib/actions/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = ['super_admin', 'clinic_admin', 'radiologist']

export async function GET(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!ALLOWED.includes(user.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const dayRange = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10) || 30, 7), 90)

  const report = await getRadiologistProductivityReport(dayRange)
  const bytes = await renderProductivityPdf(report)
  const filename = `radiora-productivity-${report.generatedAt.slice(0, 10)}-${dayRange}d.pdf`

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'pdf_exported',
    entityType: 'analytics',
    entityId: user.clinicId ?? user.id,
    metadata: { report: 'radiologist_productivity', dayRange, rows: report.rows.length, scope: report.scope, filename },
  })

  return fileResponse(bytes, 'application/pdf', filename)
}
