// Feature 9 — batch export. GET /api/vacations/export?ids=r1,r2,... → ZIP of PDFs.
// The caller selects report-bearing queue items in the UI (already filterable by
// date / modality / status); this endpoint zips the matching reports. RLS hides
// any report from another clinic, so foreign ids are silently skipped.

import type { NextRequest } from 'next/server'
import JSZip from 'jszip'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { assembleReportExport } from '@/lib/export/load'
import { renderReportPdf } from '@/lib/export/pdf'
import { fileResponse } from '@/lib/export/http'
import { logAudit } from '@/lib/actions/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IDS = 200

export async function GET(req: NextRequest, _ctx: { params: Promise<Record<string, never>> }) {
  const user = await requireCurrentUser()

  const idsParam = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = [...new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS)
  if (ids.length === 0) return new Response('No report ids provided', { status: 400 })

  const zip = new JSZip()
  const usedNames = new Set<string>()
  const exported: string[] = []

  for (const id of ids) {
    const assembled = await assembleReportExport(id)
    if (!assembled) continue // not found or RLS-hidden — skip
    const bytes = await renderReportPdf(assembled.model, assembled.images)

    let name = `${assembled.model.filenameBase}.pdf`
    if (usedNames.has(name)) name = `${assembled.model.filenameBase}_${id.slice(0, 8)}.pdf`
    usedNames.add(name)
    zip.file(name, bytes)
    exported.push(id)
  }

  if (exported.length === 0) return new Response('No exportable reports', { status: 404 })

  const zipBytes = await zip.generateAsync({ type: 'uint8array' })
  const stamp = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const filename = `radiora-export-${stamp.replace(/[^0-9-]/g, '')}.zip`

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'pdf_exported',
    entityType: 'report',
    entityId: exported[0],
    metadata: { batch: true, count: exported.length, reportIds: exported, filename },
  })

  return fileResponse(zipBytes, 'application/zip', filename)
}
