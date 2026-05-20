'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingErrorPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-xl mb-4">
            <svg
              className="w-6 h-6 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Account Not Configured</h1>
          <p className="mt-2 text-sm text-gray-500">
            Your account exists but has not been linked to a clinic or assigned a role.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm text-gray-700">
            This usually means one of the following:
          </p>
          <ul className="space-y-2 text-sm text-gray-600 list-disc list-inside">
            <li>Your administrator hasn&apos;t run the clinic setup yet</li>
            <li>Your account was created but not linked to a clinic</li>
            <li>The setup seed script needs to be re-run for your user UUID</li>
          </ul>
          <p className="text-sm text-gray-500 pt-2 border-t border-gray-100">
            Contact your administrator and ask them to run{' '}
            <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">
              supabase/seed/001_initial_admin.sql
            </code>{' '}
            with your user UUID.
          </p>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign out
          </button>
        </div>

      </div>
    </div>
  )
}
