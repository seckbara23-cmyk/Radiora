'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { logReportPrinted } from '@/lib/actions/exports'

// Feature 9 + F12 — Exporter PDF / Exporter Word / Imprimer, with a letterhead
// selector. The header choice becomes a ?header= query param: '' = clinic default,
// a header id = library header, 'none' = classic model without header.
export function ReportExportActions({
  reportId,
  headers = [],
}: {
  reportId: string
  headers?: { id: string; name: string }[]
}) {
  const t = useTranslations('reportExport')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [header, setHeader] = useState('') // '' = clinic default

  const qs = header ? `?header=${encodeURIComponent(header)}` : ''

  function handlePrint() {
    startTransition(async () => {
      await logReportPrinted(reportId)
      router.push(`/reports/${reportId}/print${qs}`)
    })
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50'

  return (
    <div className="flex flex-col items-end gap-2">
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        <span>{t('headerLabel')}</span>
        <select
          value={header}
          onChange={(e) => setHeader(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">{t('headerDefault')}</option>
          {headers.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
          <option value="none">{t('headerNone')}</option>
        </select>
      </label>

      {/* R2.9 — the emoji (📄 📝 🖨️) are replaced by the same restrained
          stroke-icon treatment R2.8 established on the public surface. The
          authenticated workstation should read as clinical software, and an
          emoji also renders differently on every OS the clinic might use. */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/reports/${reportId}/pdf${qs}`} className={btn} aria-label={t('pdf')}>
          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 3.5h7l3 3v14H7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 10v6m0 0l-2.2-2.2M12 16l2.2-2.2" />
          </svg>
          {t('pdf')}
        </a>
        <a href={`/api/reports/${reportId}/docx${qs}`} className={btn} aria-label={t('word')}>
          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 3.5h7l3 3v14H7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.5 11h5M9.5 14h5" />
          </svg>
          {t('word')}
        </a>
        <button type="button" onClick={handlePrint} disabled={isPending} className={btn}>
          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 8.5V3.5h10v5" />
            <rect x="4" y="8.5" width="16" height="8" rx="1.5" strokeWidth={1.6} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 15h10v5.5H7z" />
          </svg>
          {isPending ? t('opening') : t('print')}
        </button>
      </div>
    </div>
  )
}
