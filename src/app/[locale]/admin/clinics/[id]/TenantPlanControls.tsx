'use client'

import { useActionState } from 'react'
import { extendTrial, changePlan, type FormState } from '@/lib/actions/platform'
import type { PlanId } from '@/lib/billing/subscription'

const INITIAL: FormState = { error: null }

interface Labels {
  heading: string
  extendTrial: string
  days: string
  extend: string
  changePlan: string
  plan: string
  apply: string
  starter: string
  professional: string
  enterprise: string
  note: string
}

export function TenantPlanControls({
  clinicId,
  currentPlan,
  labels,
}: {
  clinicId: string
  currentPlan: PlanId | null
  labels: Labels
}) {
  const [trialState, extend, extending] = useActionState(extendTrial, INITIAL)
  const [planState, change, changing] = useActionState(changePlan, INITIAL)

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">{labels.heading}</h2>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Extend trial */}
        <form action={extend} className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
            {labels.extendTrial}
          </label>
          <input type="hidden" name="clinic_id" value={clinicId} />
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="days"
              min={1}
              max={90}
              defaultValue={14}
              aria-label={labels.days}
              className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">{labels.days}</span>
            <button
              disabled={extending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {labels.extend}
            </button>
          </div>
          {trialState.error && <p className="text-xs text-red-500">{trialState.error}</p>}
        </form>

        {/* Change plan (upgrade / downgrade) */}
        <form action={change} className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
            {labels.changePlan}
          </label>
          <input type="hidden" name="clinic_id" value={clinicId} />
          <div className="flex items-center gap-2">
            <select
              name="plan_id"
              defaultValue={currentPlan ?? 'professional'}
              aria-label={labels.plan}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="starter">{labels.starter}</option>
              <option value="professional">{labels.professional}</option>
              <option value="enterprise">{labels.enterprise}</option>
            </select>
            <button
              disabled={changing}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {labels.apply}
            </button>
          </div>
          {planState.error && <p className="text-xs text-red-500">{planState.error}</p>}
        </form>
      </div>

      <p className="mt-4 text-xs text-gray-400">{labels.note}</p>
    </section>
  )
}
