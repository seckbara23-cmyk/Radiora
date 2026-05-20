'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createPatient } from '@/lib/actions/patients'

const SEX_OPTIONS = ['male', 'female', 'other', 'unknown'] as const

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

export default function NewPatientPage() {
  const [state, formAction, isPending] = useActionState(createPatient, { error: null })

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <Link href="/patients" className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Back to Patients
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">New Patient</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form action={formAction} className="space-y-5">

          {state.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="first_name">First Name *</label>
              <input id="first_name" name="first_name" required autoComplete="given-name"
                className={inputCls} placeholder="Jane" disabled={isPending} />
            </div>
            <div>
              <label className={labelCls} htmlFor="last_name">Last Name *</label>
              <input id="last_name" name="last_name" required autoComplete="family-name"
                className={inputCls} placeholder="Smith" disabled={isPending} />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="mrn">Medical Record Number (MRN) *</label>
            <input id="mrn" name="mrn" required className={inputCls}
              placeholder="MRN-100001" disabled={isPending} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="date_of_birth">Date of Birth *</label>
              <input id="date_of_birth" name="date_of_birth" type="date" required
                className={inputCls} disabled={isPending} />
            </div>
            <div>
              <label className={labelCls} htmlFor="sex">Sex *</label>
              <select id="sex" name="sex" required className={inputCls} disabled={isPending}>
                <option value="">Select…</option>
                {SEX_OPTIONS.map((s) => (
                  <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" autoComplete="tel"
                className={inputCls} placeholder="+1 (555) 000-0000" disabled={isPending} />
            </div>
            <div>
              <label className={labelCls} htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email"
                className={inputCls} placeholder="patient@example.com" disabled={isPending} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <Link href="/patients"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Creating…' : 'Create Patient'}
            </button>
          </div>

        </form>
      </div>

    </div>
  )
}
