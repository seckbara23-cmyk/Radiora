'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { createVacation } from '@/lib/actions/vacations'
import type { Modality } from '@/types/study'
import type { ClinicRadiologist } from '@/types/vacation'

const MODALITIES: Modality[] = ['CT', 'MRI', 'XR', 'US', 'NM', 'PT', 'MG', 'DX', 'CR']

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export function CreateVacationForm({
  radiologists,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  radiologists: ClinicRadiologist[]
  /** Controlled open state (optional). Omit for the default self-managed button. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the built-in "+ New session" trigger (when an external control opens it). */
  hideTrigger?: boolean
}) {
  const t = useTranslations('vacationQueue')
  const router = useRouter()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v) }
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()

  const [title, setTitle]               = useState('')
  const [modality, setModality]         = useState<Modality>('CT')
  const [vacationDate, setVacationDate] = useState('')
  const [radiologistId, setRadId]       = useState('')
  const [notes, setNotes]               = useState('')

  function submit() {
    setError(null)
    start(async () => {
      const res = await createVacation({
        title,
        modality,
        vacationDate,
        radiologistId: radiologistId || undefined,
        notes:         notes || undefined,
      })
      if (res.error) { setError(res.error); return }
      setOpen(false)
      setTitle(''); setVacationDate(''); setRadId(''); setNotes('')
      if (res.id) router.push(`/vacations/${res.id}`)
      else router.refresh()
    })
  }

  if (!open) {
    if (hideTrigger) return null
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
      >
        + {t('newSession')}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{t('newSession')}</h2>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sessionTitle')}</label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('sessionTitlePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('modality')}</label>
          <select className={inputCls} value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
            {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('date')}</label>
          <input type="date" className={inputCls} value={vacationDate} onChange={(e) => setVacationDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('radiologist')}</label>
          <select className={inputCls} value={radiologistId} onChange={(e) => setRadId(e.target.value)}>
            <option value="">{t('unassigned')}</option>
            {radiologists.map((r) => (
              <option key={r.id} value={r.id}>{r.lastName} {r.firstName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('notes')}</label>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
        >
          {pending ? t('saving') : t('createSession')}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
