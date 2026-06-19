'use client'

import { useActionState } from 'react'
import { issueInvoice, confirmPayment, failPayment, type FormState } from '@/lib/actions/payments'

const INITIAL: FormState = { error: null }

export function IssueInvoiceButton({ clinicId, label }: { clinicId: string; label: string }) {
  const [state, action, pending] = useActionState(issueInvoice, INITIAL)
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="clinic_id" value={clinicId} />
      <button
        disabled={pending}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {label}
      </button>
      {state.error && <span className="text-[10px] text-red-500">{state.error}</span>}
    </form>
  )
}

export function PaymentReconcile({
  paymentId,
  labels,
}: {
  paymentId: string
  labels: { confirm: string; fail: string }
}) {
  const [confirmState, confirm, confirming] = useActionState(confirmPayment, INITIAL)
  const [failState, fail, failing] = useActionState(failPayment, INITIAL)
  const error = confirmState.error ?? failState.error

  return (
    <div className="flex items-center justify-end gap-2">
      <form action={confirm}>
        <input type="hidden" name="payment_id" value={paymentId} />
        <button
          disabled={confirming}
          className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {labels.confirm}
        </button>
      </form>
      <form action={fail}>
        <input type="hidden" name="payment_id" value={paymentId} />
        <button
          disabled={failing}
          className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {labels.fail}
        </button>
      </form>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  )
}
