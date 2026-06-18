'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { setItemStatus } from '@/lib/actions/vacations'
import { VACATION_WORKFLOW_ORDER, type VacationWorkflowStatus } from '@/types/vacation'

const POST_SIGN: VacationWorkflowStatus[] = ['signed', 'printed', 'exported']
const VALIDATE_ONLY: VacationWorkflowStatus[] = ['validated', 'signed']

export function ItemStatusControl({
  itemId,
  status,
  canValidate,
}: {
  itemId:      string
  status:      VacationWorkflowStatus
  canValidate: boolean
}) {
  const t = useTranslations('vacationQueue')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start]  = useTransition()

  function change(next: VacationWorkflowStatus) {
    if (next === status) return
    setError(null)
    start(async () => {
      const res = await setItemStatus({ itemId, status: next })
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value as VacationWorkflowStatus)}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
      >
        {VACATION_WORKFLOW_ORDER.map((s) => {
          // Physician authority: secretaries can't pick validated/signed.
          const blockedByRole = VALIDATE_ONLY.includes(s) && !canValidate
          // Validation-before-export: print/export only once signed.
          const blockedByOrder =
            (s === 'printed' || s === 'exported') && !POST_SIGN.includes(status)
          return (
            <option key={s} value={s} disabled={blockedByRole || blockedByOrder}>
              {t(`status.${s}` as Parameters<typeof t>[0])}
            </option>
          )
        })}
      </select>
      {error && <span className="text-[11px] text-red-600 max-w-[180px]">{error}</span>}
    </div>
  )
}
