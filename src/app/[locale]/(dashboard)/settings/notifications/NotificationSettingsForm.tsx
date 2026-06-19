'use client'

import { useActionState, useState } from 'react'
import {
  updateNotificationSettings,
  type NotificationSettingsState,
} from '@/lib/actions/notification-settings'
import type { NotificationSettings } from '@/types/notifications'

const INITIAL: NotificationSettingsState = { error: null }

interface Labels {
  enable: string
  enableHint: string
  number: string
  numberPlaceholder: string
  events: string
  reportValidated: string
  reportDelivered: string
  appointmentReminder: string
  criticalFinding: string
  save: string
  saving: string
  saved: string
  phiNote: string
}

function Toggle({
  name,
  defaultChecked,
  label,
  disabled,
}: {
  name: string
  defaultChecked: boolean
  label: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
      />
    </label>
  )
}

export function NotificationSettingsForm({
  settings,
  labels,
}: {
  settings: NotificationSettings
  labels: Labels
}) {
  const [state, action, pending] = useActionState(updateNotificationSettings, INITIAL)
  const [enabled, setEnabled] = useState(settings.whatsappEnabled)

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-gray-900">{labels.enable}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{labels.enableHint}</span>
          </span>
          <input
            type="checkbox"
            name="whatsapp_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </label>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">{labels.number}</label>
          <input
            type="tel"
            name="whatsapp_number"
            defaultValue={settings.whatsappNumber ?? ''}
            placeholder={labels.numberPlaceholder}
            className="mt-1 w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">{labels.events}</h2>
        <div className="divide-y divide-gray-100">
          <Toggle name="on_report_validated" defaultChecked={settings.onReportValidated} label={labels.reportValidated} disabled={!enabled} />
          <Toggle name="on_report_delivered" defaultChecked={settings.onReportDelivered} label={labels.reportDelivered} disabled={!enabled} />
          <Toggle name="on_appointment_reminder" defaultChecked={settings.onAppointmentReminder} label={labels.appointmentReminder} disabled={!enabled} />
          <Toggle name="on_critical_finding" defaultChecked={settings.onCriticalFinding} label={labels.criticalFinding} disabled={!enabled} />
        </div>
        <p className="mt-3 text-xs text-gray-400">{labels.phiNote}</p>
      </section>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {state.saved && <span className="text-sm text-green-600">{labels.saved}</span>}
        {state.error && <span className="text-sm text-red-500">{state.error}</span>}
      </div>
    </form>
  )
}
