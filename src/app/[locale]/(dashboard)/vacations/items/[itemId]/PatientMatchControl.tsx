'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { matchItemPatient } from '@/lib/actions/audio'

export function PatientMatchControl({
  itemId,
  patients,
  currentPatientId,
}: {
  itemId:            string
  patients:          { id: string; name: string }[]
  currentPatientId?: string
}) {
  const t = useTranslations('audio')
  const router = useRouter()
  const [patientId, setPatientId] = useState(currentPatientId ?? '')
  const [error, setError]         = useState<string | null>(null)
  const [pending, start]          = useTransition()

  function submit(next: string) {
    setPatientId(next)
    if (!next || next === currentPatientId) return
    setError(null)
    start(async () => {
      const res = await matchItemPatient({ itemId, patientId: next })
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <select
        value={patientId}
        disabled={pending}
        onChange={(e) => submit(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
      >
        <option value="">{t('selectPatient')}</option>
        {patients.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
