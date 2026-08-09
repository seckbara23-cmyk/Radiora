'use client'

import { Link } from '@/i18n/navigation'
import { useActionState } from 'react'
import { inviteUser } from '@/lib/actions/users'

// Must stay in sync with ASSIGNABLE_ROLES in lib/actions/users.ts (the server
// re-validates every submission against that list).
const ROLE_OPTIONS = [
  { value: 'radiologist',  label: 'Radiologist'  },
  { value: 'secretary',    label: 'Secretary'    },
  { value: 'technician',   label: 'Technician'   },
  { value: 'clinic_admin', label: 'Admin'         },
  { value: 'viewer',       label: 'Viewer'        },
] as const

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

export function InviteUserForm() {
  const [state, formAction, isPending] = useActionState(inviteUser, { error: null })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <form action={formAction} className="space-y-5">

        {state.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Name */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="first_name">First Name *</label>
            <input
              id="first_name" name="first_name" required autoComplete="given-name"
              placeholder="Jane" disabled={isPending} className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="last_name">Last Name *</label>
            <input
              id="last_name" name="last_name" required autoComplete="family-name"
              placeholder="Smith" disabled={isPending} className={inputCls}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className={labelCls} htmlFor="email">Email Address *</label>
          <input
            id="email" name="email" type="email" required autoComplete="off"
            placeholder="jane.smith@clinic.com" disabled={isPending} className={inputCls}
          />
        </div>

        {/* Role */}
        <div>
          <label className={labelCls} htmlFor="role">Role *</label>
          <select
            id="role" name="role" required defaultValue="" disabled={isPending}
            className={inputCls}
          >
            <option value="" disabled>Select a role…</option>
            {ROLE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-400">
            Admins can manage users and settings. Radiologists create and finalize reports.
            Technicians upload and manage studies. Viewers have read-only access.
          </p>
        </div>

        {/* Optional credentials */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="specialty">Specialty</label>
            <input
              id="specialty" name="specialty" placeholder="e.g. Neuroradiology"
              disabled={isPending} className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="license_number">License Number</label>
            <input
              id="license_number" name="license_number" placeholder="e.g. MD-123456"
              disabled={isPending} className={inputCls}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <Link
            href="/users"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
          >
            {isPending ? 'Sending invite…' : 'Send Invite'}
          </button>
        </div>

      </form>
    </div>
  )
}
