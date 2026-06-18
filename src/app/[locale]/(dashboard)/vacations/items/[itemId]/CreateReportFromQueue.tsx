'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { createReportFromQueueItem } from '@/lib/actions/report-from-queue'

interface Props {
  itemId:     string
  hasPatient: boolean
}

export function CreateReportFromQueue({ itemId, hasPatient }: Props) {
  const t = useTranslations('queueReport')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function create() {
    setError(null)
    start(async () => {
      const res = await createReportFromQueueItem(itemId)
      if (res.error) { setError(res.error); return }
      if (res.reportId) router.push(`/reports/${res.reportId}`)
    })
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700">{t('title')}</h2>
      <p className="mt-0.5 text-xs text-gray-500">{t('noReportHint')}</p>

      {hasPatient ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={create}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? t('creating') : t('create')}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {t('confirmPatient')}
        </div>
      )}
    </section>
  )
}
