'use client'

import { useActionState, useState } from 'react'
import { initiatePayment, type PaymentState } from '@/lib/actions/payments'
import { CLINIC_PAYMENT_METHODS } from '@/lib/billing/payments'

const INITIAL: PaymentState = { error: null }

export function PayInvoice({
  invoiceId,
  labels,
}: {
  invoiceId: string
  labels: {
    pay: string
    cancel: string
    chooseMethod: string
    confirm: string
    pendingTitle: string
    pendingBody: string
    reference: string
    methods: Record<string, string>
  }
}) {
  const [state, formAction, pending] = useActionState(initiatePayment, INITIAL)
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<string>(CLINIC_PAYMENT_METHODS[0])

  // Once a reference comes back the attempt is recorded (pending reconciliation).
  if (state.providerRef) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <p className="font-medium">{labels.pendingTitle}</p>
        <p className="mt-0.5">{labels.pendingBody}</p>
        <p className="mt-1 font-mono text-[11px] text-amber-700">
          {labels.reference}: {state.providerRef}
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        {labels.pay}
      </button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="method" value={method} />
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">
          {labels.chooseMethod}
        </span>
        <div className="flex gap-1">
          {CLINIC_PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                method === m
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {labels.methods[m] ?? m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          {labels.cancel}
        </button>
        <button
          disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {labels.confirm}
        </button>
      </div>
      {state.error && <span className="text-[10px] text-red-500">{state.error}</span>}
    </form>
  )
}
