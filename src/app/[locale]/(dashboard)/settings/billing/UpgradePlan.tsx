'use client'

import { useActionState, useState } from 'react'
import { initiateUpgrade, type PaymentState } from '@/lib/actions/payments'
import { CLINIC_PAYMENT_METHODS } from '@/lib/billing/payments'

const INITIAL: PaymentState = { error: null }

export type UpgradeOption = { id: string; name: string; price: string }

export function UpgradePlan({
  options,
  labels,
}: {
  options: UpgradeOption[]
  labels: {
    heading: string
    intro: string
    targetPlan: string
    chooseMethod: string
    upgrade: string
    pendingTitle: string
    pendingBody: string
    reference: string
    continueCheckout: string
    methods: Record<string, string>
  }
}) {
  const [state, formAction, pending] = useActionState(initiateUpgrade, INITIAL)
  const [target, setTarget] = useState(options[0]?.id ?? '')
  const [method, setMethod] = useState<string>(CLINIC_PAYMENT_METHODS[0])

  if (options.length === 0) return null

  if (state.providerRef) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-medium">{labels.pendingTitle}</p>
        <p className="mt-0.5">{labels.pendingBody}</p>
        <p className="mt-1 font-mono text-xs text-amber-700">
          {labels.reference}: {state.providerRef}
        </p>
        {state.checkoutUrl && (
          <a
            href={state.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            {labels.continueCheckout}
          </a>
        )}
      </div>
    )
  }

  return (
    <form action={formAction} className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{labels.heading}</h3>
      <p className="mt-1 text-sm text-gray-500">{labels.intro}</p>
      <input type="hidden" name="target_plan" value={target} />
      <input type="hidden" name="method" value={method} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-400">{labels.targetPlan}</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.price}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-xs uppercase tracking-wide text-gray-400">{labels.chooseMethod}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {CLINIC_PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium ${
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
      </div>

      {state.error && <p className="mt-3 text-xs text-red-500">{state.error}</p>}

      <button
        disabled={pending}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {labels.upgrade}
      </button>
    </form>
  )
}
