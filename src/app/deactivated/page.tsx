export default function DeactivatedPage() {
  return (
    <div className="min-h-full flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-5">
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">Account deactivated</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Your account has been deactivated. Please contact your clinic administrator
          to restore access.
        </p>

        {/* Sign out — POST form so cookies are properly cleared */}
        <form action="/auth/logout" method="post" className="mt-8">
          <button
            type="submit"
            className="px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition"
          >
            Sign out
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400">
          Radiora Medical &mdash; HIPAA Compliant
        </p>

      </div>
    </div>
  )
}
