'use client'

import { useActionState } from 'react'
import { updateStudyStatus } from '@/lib/actions/studies'
import type { StudyStatus } from '@/types/study'

const STATUS_OPTIONS: Array<{ value: StudyStatus; label: string }> = [
  { value: 'pending',   label: 'Pending' },
  { value: 'in_review', label: 'In Review' },
  { value: 'reported',  label: 'Reported' },
  { value: 'validated', label: 'Validated' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function StudyStatusForm({
  studyId,
  currentStatus,
}: {
  studyId: string
  currentStatus: StudyStatus
}) {
  const [state, formAction, isPending] = useActionState(updateStudyStatus, { error: null })

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={studyId} />
      <select
        name="status"
        defaultValue={currentStatus}
        disabled={isPending}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
      >
        {STATUS_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition"
      >
        {isPending ? 'Saving…' : 'Update Status'}
      </button>
    </form>
  )
}
