'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { logReportPrinted } from '@/lib/actions/exports'

// Feature 9 — Exporter PDF / Exporter Word / Imprimer.
// PDF & Word are direct downloads from the route handlers (which audit the
// export). Imprimer logs the 'printed' event then opens the formatted print page.
export function ReportExportActions({ reportId }: { reportId: string }) {
  const t = useTranslations('reportExport')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handlePrint() {
    startTransition(async () => {
      await logReportPrinted(reportId)
      router.push(`/reports/${reportId}/print`)
    })
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/reports/${reportId}/pdf`} className={btn} aria-label={t('pdf')}>
        <span aria-hidden>📄</span> {t('pdf')}
      </a>
      <a href={`/api/reports/${reportId}/docx`} className={btn} aria-label={t('word')}>
        <span aria-hidden>📝</span> {t('word')}
      </a>
      <button type="button" onClick={handlePrint} disabled={isPending} className={btn}>
        <span aria-hidden>🖨️</span> {isPending ? t('opening') : t('print')}
      </button>
    </div>
  )
}
