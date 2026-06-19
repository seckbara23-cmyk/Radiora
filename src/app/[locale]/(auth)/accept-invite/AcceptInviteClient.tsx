'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { SenegalBar } from '@/components/ui/senegal-accents'
import {
  parseInviteTokens,
  hasInviteSession,
  decodeEmailFromJwt,
  isSessionConflict,
  type InviteTokens,
} from '@/lib/auth/invite-callback'

type Step = 'loading' | 'conflict' | 'form' | 'error' | 'done'

export function AcceptInviteClient() {
  const t = useTranslations('acceptInvite')
  const router = useRouter()

  const [step, setStep] = useState<Step>('loading')
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // One Supabase browser client for the whole flow. detectSessionInUrl is OFF so
  // the invited tokens are NOT auto-applied — we apply them deliberately, only
  // after checking for (and resolving) a conflicting session.
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const tokensRef = useRef<InviteTokens | null>(null)

  function getClient() {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } },
      )
    }
    return supabaseRef.current
  }

  // Apply the invited session, then move to the set-password step.
  async function applyInvite(): Promise<void> {
    const tokens = tokensRef.current
    const supabase = getClient()
    if (!tokens?.accessToken || !tokens.refreshToken) {
      setError(t('invalidLink'))
      setStep('error')
      return
    }
    const { error: setErr } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    })
    if (setErr) {
      setError(t('invalidLink'))
      setStep('error')
      return
    }
    // Strip the token fragment from the URL/history so it can't be replayed.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setStep('form')
  }

  // Parse the invite on mount and decide the initial step.
  useEffect(() => {
    let cancelled = false
    async function init() {
      const tokens = parseInviteTokens(
        typeof window !== 'undefined' ? window.location.hash || window.location.search : '',
      )
      tokensRef.current = tokens

      if (tokens.error) {
        if (cancelled) return
        setError(tokens.errorDescription ?? t('invalidLink'))
        setStep('error')
        return
      }
      if (!hasInviteSession(tokens)) {
        if (cancelled) return
        setError(t('invalidLink'))
        setStep('error')
        return
      }

      const invited = decodeEmailFromJwt(tokens.accessToken)
      if (!cancelled) setInvitedEmail(invited)

      // Read any pre-existing session WITHOUT adopting the invite yet.
      const supabase = getClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const existing = session?.user?.email ?? null
      if (!cancelled) setExistingEmail(existing)

      if (isSessionConflict(existing, invited)) {
        if (!cancelled) setStep('conflict')
        return
      }
      await applyInvite()
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Conflict screen → sign out of the current session, then adopt the invite.
  async function signOutAndContinue() {
    setSubmitting(true)
    setError(null)
    try {
      await getClient().auth.signOut()
    } catch {
      // Even if sign-out reports an error, setSession below replaces the session.
    }
    await applyInvite()
    setSubmitting(false)
  }

  async function handleSetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t('passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }
    setSubmitting(true)
    const { error: updErr } = await getClient().auth.updateUser({ password })
    if (updErr) {
      setError(updErr.message)
      setSubmitting(false)
      return
    }
    setStep('done')
    router.push('/dashboard')
  }

  const inputCls =
    'w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-500'

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
          <h1 className="text-2xl font-bold text-gray-900">Radiora Medical</h1>
          <p className="mt-1 text-sm text-gray-500">{t('title')}</p>
        </div>

        <SenegalBar className="rounded-t-2xl" />

        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-gray-200 p-8">
          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <svg className="w-6 h-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500">{t('loading')}</p>
            </div>
          )}

          {/* Session conflict — already signed in as someone else */}
          {step === 'conflict' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" />
                </svg>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{t('conflictTitle')}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {invitedEmail
                      ? t('conflictBody', { current: existingEmail ?? '', invited: invitedEmail })
                      : t('conflictBodyUnknown', { current: existingEmail ?? '' })}
                  </p>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="button"
                onClick={signOutAndContinue}
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
              >
                {submitting ? t('submitting') : t('continueAs')}
              </button>
              <Link
                href="/dashboard"
                className="block text-center text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                {t('cancel')}
              </Link>
            </div>
          )}

          {/* Set password */}
          {step === 'form' && (
            <form className="space-y-5" onSubmit={handleSetPassword}>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{t('subtitlePassword')}</h2>
                {invitedEmail && (
                  <p className="mt-1 text-xs text-gray-400">{t('invitedAs', { invited: invitedEmail })}</p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('passwordLabel')}
                </label>
                <input
                  id="password" name="password" type="password" autoComplete="new-password" required
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('confirmLabel')}
                </label>
                <input
                  id="confirm" name="confirm" type="password" autoComplete="new-password" required
                  placeholder={t('passwordPlaceholder')}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
              >
                {submitting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {submitting ? t('submitting') : t('submit')}
              </button>
            </form>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">{t('successTitle')}</h2>
              <p className="text-sm text-gray-500">{t('successBody')}</p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{t('errorTitle')}</h2>
                  <p className="mt-1 text-sm text-gray-600">{error ?? t('invalidLink')}</p>
                </div>
              </div>
              <Link
                href="/login"
                className="block w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition text-center"
              >
                {t('backToLogin')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
