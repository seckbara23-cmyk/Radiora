'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { updatePatient } from '@/lib/actions/patients'
import type { Patient } from '@/types/patient'

const SEX_OPTIONS = ['male', 'female', 'other', 'unknown'] as const
const STATUS_OPTIONS = ['active', 'inactive', 'deceased'] as const

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

export function PatientEditForm({ patient }: { patient: Patient }) {
  const [state, formAction, isPending] = useActionState(updatePatient, { error: null })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="id" value={patient.id} />

        {state.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="first_name">First Name *</label>
            <input id="first_name" name="first_name" required defaultValue={patient.firstName}
              className={inputCls} disabled={isPending} />
          </div>
          <div>
            <label className={labelCls} htmlFor="last_name">Last Name *</label>
            <input id="last_name" name="last_name" required defaultValue={patient.lastName}
              className={inputCls} disabled={isPending} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Medical Record Number</label>
          <p className="text-sm text-gray-500 font-mono">{patient.mrn}</p>
          <p className="mt-0.5 text-xs text-gray-400">MRN cannot be changed after creation.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="date_of_birth">Date of Birth *</label>
            <input id="date_of_birth" name="date_of_birth" type="date" required
              defaultValue={patient.dateOfBirth} className={inputCls} disabled={isPending} />
          </div>
          <div>
            <label className={labelCls} htmlFor="sex">Sex *</label>
            <select id="sex" name="sex" required defaultValue={patient.sex}
              className={inputCls} disabled={isPending}>
              {SEX_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" defaultValue={patient.phone ?? ''}
              className={inputCls} disabled={isPending} />
          </div>
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={patient.email ?? ''}
              className={inputCls} disabled={isPending} />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="status">Status *</label>
          <select id="status" name="status" required defaultValue={patient.status}
            className={inputCls} disabled={isPending}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href={`/patients/${patient.id}`}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
          >
            Cancel
          </Link>
          <button type="submit" disabled={isPending}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

      </form>
    </div>
  )
}
