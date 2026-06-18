'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { addVacationItem } from '@/lib/actions/vacations'

const inputCls =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export function AddItemForm({ vacationId }: { vacationId: string }) {
  const t = useTranslations('vacationQueue')
  const router = useRouter()
  const [patientLabel, setPatientLabel] = useState('')
  const [examNumber, setExamNumber]     = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [pending, start]                = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const res = await addVacationItem({
        vacationId,
        patientLabel: patientLabel || undefined,
        examNumber:   examNumber || undefined,
      })
      if (res.error) { setError(res.error); return }
      setPatientLabel(''); setExamNumber('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('patientLabel')}</label>
        <input
          className={inputCls}
          value={patientLabel}
          onChange={(e) => setPatientLabel(e.target.value)}
          placeholder={t('patientLabelPlaceholder')}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('examNumber')}</label>
        <input
          className={inputCls}
          value={examNumber}
          onChange={(e) => setExamNumber(e.target.value)}
          placeholder="—"
        />
      </div>
      <button
        onClick={submit}
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
      >
        {pending ? t('saving') : `+ ${t('addItem')}`}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  )
}
