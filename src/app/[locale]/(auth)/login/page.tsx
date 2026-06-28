'use client'

import { useState, Suspense, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { SenegalBar } from '@/components/ui/senegal-accents'

// Reads ?onboarded=1 (set by the signup flow). Isolated so the search-params
// read sits behind its own Suspense boundary (required for static prerender).
function OnboardedBanner() {
  const t = useTranslations('auth')
  const justOnboarded = useSearchParams().get('onboarded') === '1'
  if (!justOnboarded) return null
  return (
    <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
      <p className="text-sm text-green-700">{t('onboardedNotice')}</p>
    </div>
  )
}

export default function LoginPage() {
  const t = useTranslations('auth')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(t('invalidCredentials'))
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-gray-50 bg-sn-pattern py-12 px-4">
      <div className="w-full max-w-md">

        {/* App identity */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('welcomeTitle')}</h1>
          <p className="mt-2 text-sm font-medium text-blue-700">{t('tagline')}</p>
        </div>

        {/* Tricolor accent bar above card */}
        <SenegalBar className="rounded-t-2xl" />

        {/* Card */}
        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-gray-200 p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>

            {!error && (
              <Suspense fallback={null}>
                <OnboardedBanner />
              </Suspense>
            )}

            {error && (
              <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('email')}
              </label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('password')}
              </label>
              <input
                id="password" name="password" type="password" autoComplete="current-password" required
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                {t('rememberMe')}
              </label>
              <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                {t('forgotPassword')}
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? t('signingIn') : t('signIn')}
            </button>

            {/* Secure-access note (presentation Screen 1) */}
            <div className="flex items-start gap-2 pt-1 text-xs text-gray-500">
              <svg className="w-4 h-4 mt-px shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span>{t('secureNote')}</span>
            </div>

          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t('noAccount')}{' '}
          <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
            {t('createAccount')}
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-gray-400">
          {t('footer', { year: new Date().getFullYear() })}
        </p>

        <p className="mt-1.5 text-center text-xs text-gray-400">
          <a
            href="https://teranga-tech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-gray-600"
          >
            {t('builtBy')}
          </a>
        </p>

      </div>
    </div>
  )
}
