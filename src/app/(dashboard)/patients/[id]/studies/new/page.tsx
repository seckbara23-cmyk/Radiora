'use client'

import Link from 'next/link'
import { use } from 'react'
import { useActionState } from 'react'
import { createStudy } from '@/lib/actions/studies'

const MODALITIES = ['CT', 'MRI', 'XR', 'US', 'NM', 'PT', 'MG', 'DX', 'CR'] as const
const PRIORITIES = ['routine', 'urgent', 'stat'] as const

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

type Props = { params: Promise<{ id: string }> }

export default function NewStudyPage({ params }: Props) {
  const { id: patientId } = use(params)
  const [state, formAction, isPending] = useActionState(createStudy, { error: null })

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <Link href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Back to Patient
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">New Study</h1>
        <p className="mt-1 text-sm text-gray-500">Add an imaging study for this patient.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="patient_id" value={patientId} />

          {state.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="modality">Modality *</label>
              <select id="modality" name="modality" required className={inputCls} disabled={isPending}>
                <option value="">Select…</option>
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="priority">Priority *</label>
              <select id="priority" name="priority" required defaultValue="routine"
                className={inputCls} disabled={isPending}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="body_part">Body Part / Region *</label>
            <input id="body_part" name="body_part" required className={inputCls}
              placeholder="e.g. Chest, Brain, Lumbar Spine" disabled={isPending} />
          </div>

          <div>
            <label className={labelCls} htmlFor="description">Clinical Indication</label>
            <input id="description" name="description" className={inputCls}
              placeholder="e.g. Rule out pulmonary embolism, follow-up on known nodule"
              disabled={isPending} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="study_date">Study Date *</label>
              <input id="study_date" name="study_date" type="date" required
                defaultValue={today} className={inputCls} disabled={isPending} />
            </div>
            <div>
              <label className={labelCls} htmlFor="referring_physician">Requested By</label>
              <input id="referring_physician" name="referring_physician" className={inputCls}
                placeholder="Dr. Name" disabled={isPending} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <Link href={`/patients/${patientId}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
            >
              Cancel
            </Link>
            <button type="submit" disabled={isPending}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Creating…' : 'Create Study'}
            </button>
          </div>

        </form>
      </div>

    </div>
  )
}
