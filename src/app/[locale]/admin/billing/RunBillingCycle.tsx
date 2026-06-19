'use client'

import { useActionState } from 'react'
import { runBillingCycle, type BillingRunState } from '@/lib/actions/billing-run'

const INITIAL: BillingRunState = { error: null }

export function RunBillingCycle({
  labels,
}: {
  labels: { run: string; running: string; done: string; reminders: string; invoices: string; graced: string; suspended: string }
}) {
  const [state, action, pending] = useActionState(runBillingCycle, INITIAL)

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={action}>
        <button
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? labels.running : labels.run}
        </button>
      </form>
      {state.summary && (
        <p className="text-xs text-gray-500">
          {labels.done}: {state.summary.reminders} {labels.reminders} · {state.summary.invoices}{' '}
          {labels.invoices} · {state.summary.graced} {labels.graced} · {state.summary.suspended}{' '}
          {labels.suspended}
        </p>
      )}
      {state.error && <span className="text-xs text-red-500">{state.error}</span>}
    </div>
  )
}
