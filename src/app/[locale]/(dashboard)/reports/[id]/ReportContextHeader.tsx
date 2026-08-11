// R2.9 — one compact context strip, replacing a title block plus a separate
// study bar plus two status badges.
//
// WHAT CHANGED AND WHY
//
//  • STATUS VOCABULARY. The old header rendered `statuses.report.<status>` —
//    the RAW enum: "Finalisé", "En révision", "Modifié". `/reports` has always
//    used `reportDisplayStatus`, so the SAME report read "À relire" in the list
//    and "Modifié" on its own page. `display-status.ts` exists precisely to
//    stop that; this now goes through it, like every other surface.
//
//  • THE BACK-LINK IS GONE. It pointed at `/studies/{id}`, which R2.1 froze:
//    `isFrozenRoute('/studies/abc')` is true, so middleware 307'd the
//    radiologist to `/reports`. A link captioned "← CT — Cerveau" that
//    silently lands on the report list is worse than no link. It is replaced
//    by a link to Reports, which is where it actually went.
//
//  • LIFECYCLE, NOT A WIZARD. The reference concept's six steps describe a
//    lifecycle, not six pages. This is a single-line cue of where the report
//    stands — no step numbers, no per-stage panels, no forced order.

import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { reportDisplayStatus, displayStatusVariant } from '@/lib/reports/display-status'
import type { ReportStatus } from '@/types/report'

interface Props {
  status: ReportStatus
  delivered: boolean
  patientName: string
  patientMrn: string | null
  modality: string | null
  bodyPart: string | null
  studyDate: string | null
}

export async function ReportContextHeader({
  status, delivered, patientName, patientMrn, modality, bodyPart, studyDate,
}: Props) {
  const t   = await getTranslations('reports')
  const tSt = await getTranslations('statuses')

  const display = reportDisplayStatus(status, { delivered })

  return (
    <header className="space-y-3">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
      >
        ← {t('title')}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-gray-900">
            {patientName || '—'}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            {patientMrn && <span className="font-mono text-xs">{patientMrn}</span>}
            {patientMrn && (modality || bodyPart) && <span className="text-gray-300">·</span>}
            {modality && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                {modality}
              </span>
            )}
            {bodyPart && <span>{bodyPart}</span>}
            {studyDate && <span className="text-gray-300">·</span>}
            {studyDate && <span className="text-xs">{studyDate}</span>}
          </p>
        </div>

        <Badge variant={displayStatusVariant[display]}>
          {tSt(`display.${display}` as Parameters<typeof tSt>[0])}
        </Badge>
      </div>
    </header>
  )
}
