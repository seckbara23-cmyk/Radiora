// Feature 9 — PDF export endpoint. GET /api/reports/:id/pdf → application/pdf.
// RLS (via assembleReportExport) guarantees the caller can only export a report
// from their own clinic. Draft reports come back watermarked BROUILLON.

import type { NextRequest } from 'next/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { assembleReportExport } from '@/lib/export/load'
import { renderReportPdf } from '@/lib/export/pdf'
import { fileResponse } from '@/lib/export/http'
import { logAudit } from '@/lib/actions/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await requireCurrentUser()

  const assembled = await assembleReportExport(id)
  if (!assembled) return new Response('Report not found', { status: 404 })

  const bytes = await renderReportPdf(assembled.model, assembled.images)
  const filename = `${assembled.model.filenameBase}.pdf`

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'pdf_exported',
    entityType: 'report',
    entityId: id,
    metadata: { filename, draft: assembled.model.isDraft },
  })

  return fileResponse(bytes, 'application/pdf', filename)
}
