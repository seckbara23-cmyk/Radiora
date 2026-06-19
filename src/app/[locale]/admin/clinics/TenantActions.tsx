'use client'

import { useActionState } from 'react'
import { suspendClinic, reactivateClinic, type FormState } from '@/lib/actions/platform'

const INITIAL: FormState = { error: null }

export function TenantActions({
  clinicId,
  status,
  labels,
}: {
  clinicId: string
  status: string
  labels: { suspend: string; reactivate: string }
}) {
  const [suspendState, suspend, suspending] = useActionState(suspendClinic, INITIAL)
  const [reactivateState, reactivate, reactivating] = useActionState(reactivateClinic, INITIAL)

  const isSuspended = status === 'suspended' || status === 'inactive'
  const error = suspendState.error ?? reactivateState.error

  return (
    <div className="flex flex-col items-end gap-1">
      {isSuspended ? (
        <form action={reactivate}>
          <input type="hidden" name="clinic_id" value={clinicId} />
          <button
            disabled={reactivating}
            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {labels.reactivate}
          </button>
        </form>
      ) : (
        <form action={suspend}>
          <input type="hidden" name="clinic_id" value={clinicId} />
          <button
            disabled={suspending}
            className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {labels.suspend}
          </button>
        </form>
      )}
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  )
}
