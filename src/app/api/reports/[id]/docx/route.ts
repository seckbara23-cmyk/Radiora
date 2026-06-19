// Feature 9 — DOCX export endpoint. GET /api/reports/:id/docx → editable Word.
// Same RLS-protected assembly and BROUILLON watermarking as the PDF route.

import type { NextRequest } from 'next/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { assembleReportExport, parseHeaderChoice } from '@/lib/export/load'
import { renderReportDocx } from '@/lib/export/docx'
import { fileResponse } from '@/lib/export/http'
import { logAudit } from '@/lib/actions/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await requireCurrentUser()

  const choice = parseHeaderChoice(req.nextUrl.searchParams.get('header'))
  const assembled = await assembleReportExport(id, choice)
  if (!assembled) return new Response('Report not found', { status: 404 })

  const bytes = await renderReportDocx(assembled.model, assembled.images)
  const filename = `${assembled.model.filenameBase}.docx`

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'docx_exported',
    entityType: 'report',
    entityId: id,
    metadata: { filename, draft: assembled.model.isDraft, header: choice.includeHeader === false ? 'none' : (choice.headerId ?? 'default') },
  })

  return fileResponse(bytes, DOCX_MIME, filename)
}
