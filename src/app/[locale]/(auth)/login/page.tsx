'use client'

// R2.8 visual convergence pass — centered composition, converging back toward
// the original Radiora login concept while keeping every engineering/safety
// decision from the R2.8 split-screen version exactly as it was:
//
//   • AUTHENTICATION IS BYTE-IDENTICAL: still a direct
//     supabase.auth.signInWithPassword() call, still redirecting to /reports
//     on success. Nothing below this comment block touches that contract.
//   • No password-reset flow exists anywhere in this codebase (no
//     resetPasswordForEmail call, no route) — "Mot de passe oublié ?" stays
//     removed rather than reintroduced as a dead href="#" or a fabricated flow.
//   • The self-service trial signup (/signup) is real, audited infrastructure
//     — kept, visible, unchanged.
//   • No "Conforme HIPAA" / "HIPAA Compliant" claim — not restored.
//
// What changed is presentation only: the two-column split layout is replaced
// by the original's single centered composition (large brand mark + wordmark
// → tagline → card), matching the visual reference while every string still
// comes from next-intl, not new hardcoded copy.
//
// The password-visibility toggle below is pure client UI state — it flips the
// input's `type` attribute and nothing else; the value, onChange, name and
// autoComplete behavior handed to Supabase are untouched.

import { useState, Suspense, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { RadioraMark } from '@/components/brand/radiora-mark'
import { RadiologyScanMark } from '@/components/marketing/radiology-visual'
import { LocaleSwitch } from '@/components/marketing/locale-switch'

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

/** Soft, very light decorative backdrop. Hidden below `md:` — on a small
 *  viewport nothing should compete with the form (§11 of the brief). */
function LoginBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl" />
      <RadiologyScanMark className="absolute -right-20 top-1/2 h-[420px] w-[420px] -translate-y-1/2 text-blue-600/[0.07]" />
      {/* Two faint wide arcs, echoing the reference concept's background curves. */}
      <svg className="absolute inset-0 h-full w-full text-blue-900/[0.04]" fill="none" aria-hidden="true">
        <circle cx="8%" cy="85%" r="260" stroke="currentColor" strokeWidth="1" />
        <circle cx="95%" cy="8%" r="180" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  )
}

export default function LoginPage() {
  const t = useTranslations('auth')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

    router.push('/reports')
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-blue-50/50 via-white to-white">
      <LoginBackdrop />

      {/* Locale switch — corner-anchored so it never competes with the
          centered wordmark/heading below it (§10). */}
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <LocaleSwitch />
      </div>

      <div className="relative flex min-h-full flex-col items-center px-4 py-16 sm:py-20">

        {/* ── Brand hero ── */}
        <Link href="/" className="flex flex-col items-center gap-4 text-center">
          <RadioraMark className="h-16 w-16 text-3xl sm:h-20 sm:w-20 sm:text-4xl" />
          <span className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            RADIORA
          </span>
        </Link>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-gray-500 sm:text-base">
          {t('tagline')}
        </p>
        <p className="mt-2 max-w-sm text-center text-xs leading-relaxed text-blue-700/80 sm:text-sm">
          {t('aiPositioning')}
        </p>

        {/* ── Card ── */}
        <div className="mt-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white/95 p-8 shadow-md shadow-gray-900/5 backdrop-blur-sm sm:p-9">
          <h1 className="text-lg font-semibold text-gray-900">{t('subtitle')}</h1>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>

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
              <div className="relative">
                <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
                </svg>
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('password')}
              </label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="10.5" width="14" height="9" rx="1.6" strokeWidth={1.6} />
                  <path strokeLinecap="round" strokeWidth={1.6} d="M8 10.5V7a4 4 0 018 0v3.5" />
                </svg>
                <input
                  id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-11 text-sm text-gray-900 placeholder-gray-400 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
                {/* Pure presentation: flips local `showPassword` state only —
                    never touches the value handed to signInWithPassword. */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 disabled:opacity-50"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 3l18 18M10.6 10.6a2.5 2.5 0 003.5 3.5M6.6 6.7C4.5 8.1 3 10 2.5 12c1.3 4 5.2 7 9.5 7 1.6 0 3.1-.4 4.4-1.1M17.9 17.9C19.9 16.5 21.3 14.4 21.5 12c-1.1-3.5-4.3-6.2-8-6.8" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                      <circle cx="12" cy="12" r="2.5" strokeWidth={1.6} />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {t('rememberMe')}
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-400"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? t('signingIn') : t('signIn')}
              {!loading && (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m0 0l-6-6m6 6l-6 6" />
                </svg>
              )}
            </button>

            {/* Short, restrained label; the fuller factual explanation is
                still there, as a tooltip rather than a paragraph (§8). */}
            <p title={t('secureNote')} className="flex items-center justify-center gap-1.5 pt-1 text-xs text-gray-500">
              <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              {t('secureAccessShort')}
            </p>

          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t('noAccount')}{' '}
          <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
            {t('createAccount')}
          </Link>
        </p>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">{t('footer', { year: new Date().getFullYear() })}</p>
          <p className="mt-1">
            <a
              href="https://teranga-tech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 transition hover:text-gray-600"
            >
              {t('builtBy')}
            </a>
          </p>
        </div>

      </div>
    </div>
  )
}
