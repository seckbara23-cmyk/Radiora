'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import {
  requestSignupCode,
  verifySignupCode,
  startFreeTrial,
  type CodeRequestState,
  type CodeVerifyState,
  type StartTrialState,
} from '@/lib/actions/onboarding'

const REQ_INIT: CodeRequestState = { error: null }
const VER_INIT: CodeVerifyState = { error: null }
const START_INIT: StartTrialState = { error: null }

const FIELD =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const LABEL = 'block text-sm font-medium text-gray-700'

export function SignupWizard() {
  const t = useTranslations('signup')
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    phone: '',
    code: '',
    clinic_name: '',
    city: '',
    country: 'SN',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const [reqState, requestCode, requesting] = useActionState(requestSignupCode, REQ_INIT)
  const [verState, verifyCode, verifying] = useActionState(verifySignupCode, VER_INIT)
  const [startState, start, starting] = useActionState(startFreeTrial, START_INIT)

  // Reflect verification results into per-channel flags.
  useEffect(() => {
    if (verState.verified && verState.channel === 'email') setEmailVerified(true)
    if (verState.verified && verState.channel === 'phone') setPhoneVerified(true)
  }, [verState])

  // On success → send the user to login with a confirmation banner.
  useEffect(() => {
    if (startState.slug) router.push('/login?onboarded=1')
  }, [startState.slug, router])

  const steps = [t('step1'), t('step2'), t('step3'), t('step4'), t('step5')]

  const canNext1 =
    form.first_name.trim() &&
    form.last_name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.password.length >= 8

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {steps.map((label, i) => {
          const n = i + 1
          return (
            <li key={n} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  step === n ? 'bg-blue-600 text-white' : step > n ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > n ? '✓' : n}
              </span>
              <span className={step === n ? 'font-medium text-gray-900' : 'text-gray-400'}>{label}</span>
            </li>
          )
        })}
      </ol>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {/* Step 1 — account */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">{t('step1')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>{t('firstName')}</label>
                <input value={form.first_name} onChange={set('first_name')} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>{t('lastName')}</label>
                <input value={form.last_name} onChange={set('last_name')} className={FIELD} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>{t('email')}</label>
                <input type="email" value={form.email} onChange={set('email')} className={FIELD} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>{t('password')}</label>
                <input type="password" value={form.password} onChange={set('password')} className={FIELD} />
                <p className="mt-1 text-xs text-gray-400">{t('passwordHint')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — verify email */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">{t('step2')}</h2>
            <p className="text-sm text-gray-500">{t('emailVerifyIntro', { email: form.email })}</p>
            {!emailVerified ? (
              <>
                <form action={requestCode}>
                  <input type="hidden" name="channel" value="email" />
                  <input type="hidden" name="email" value={form.email} />
                  <input type="hidden" name="target" value={form.email} />
                  <button disabled={requesting} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {reqState.sent && reqState.channel === 'email' ? t('resendCode') : t('sendCode')}
                  </button>
                </form>
                {reqState.sent && reqState.channel === 'email' && (
                  <p className="text-xs text-green-600">
                    {t('codeSent')}
                    {reqState.devCode && <span className="ml-1 font-mono text-gray-400">[{reqState.devCode}]</span>}
                  </p>
                )}
                <form action={verifyCode} className="flex items-end gap-2">
                  <input type="hidden" name="channel" value="email" />
                  <input type="hidden" name="email" value={form.email} />
                  <div>
                    <label className={LABEL}>{t('code')}</label>
                    <input name="code" inputMode="numeric" maxLength={6} className={`${FIELD} w-32 font-mono tracking-widest`} />
                  </div>
                  <button disabled={verifying} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {t('verify')}
                  </button>
                </form>
                {verState.error && verState.channel !== 'phone' && <p className="text-xs text-red-500">{verState.error}</p>}
                {reqState.error && reqState.channel !== 'phone' && <p className="text-xs text-red-500">{reqState.error}</p>}
              </>
            ) : (
              <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">✓ {t('emailVerified')}</p>
            )}
          </div>
        )}

        {/* Step 3 — verify phone */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">{t('step3')}</h2>
            <div>
              <label className={LABEL}>{t('phone')}</label>
              <input value={form.phone} onChange={set('phone')} placeholder="+221 77 123 45 67" disabled={phoneVerified} className={`${FIELD} max-w-xs`} />
            </div>
            {!phoneVerified ? (
              <>
                <form action={requestCode}>
                  <input type="hidden" name="channel" value="phone" />
                  <input type="hidden" name="email" value={form.email} />
                  <input type="hidden" name="target" value={form.phone} />
                  <button disabled={requesting || !form.phone.trim()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {reqState.sent && reqState.channel === 'phone' ? t('resendCode') : t('sendCode')}
                  </button>
                </form>
                {reqState.sent && reqState.channel === 'phone' && (
                  <p className="text-xs text-green-600">
                    {t('codeSentPhone', { phone: reqState.masked ?? '' })}
                    {reqState.devCode && <span className="ml-1 font-mono text-gray-400">[{reqState.devCode}]</span>}
                  </p>
                )}
                <form action={verifyCode} className="flex items-end gap-2">
                  <input type="hidden" name="channel" value="phone" />
                  <input type="hidden" name="email" value={form.email} />
                  <div>
                    <label className={LABEL}>{t('code')}</label>
                    <input name="code" inputMode="numeric" maxLength={6} className={`${FIELD} w-32 font-mono tracking-widest`} />
                  </div>
                  <button disabled={verifying} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {t('verify')}
                  </button>
                </form>
                {verState.error && verState.channel === 'phone' && <p className="text-xs text-red-500">{verState.error}</p>}
                {reqState.error && reqState.channel === 'phone' && <p className="text-xs text-red-500">{reqState.error}</p>}
              </>
            ) : (
              <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">✓ {t('phoneVerified')}</p>
            )}
          </div>
        )}

        {/* Step 4 — clinic */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">{t('step4')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL}>{t('clinicName')}</label>
                <input value={form.clinic_name} onChange={set('clinic_name')} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>{t('city')}</label>
                <input value={form.city} onChange={set('city')} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>{t('country')}</label>
                <input value={form.country} onChange={set('country')} className={FIELD} />
              </div>
            </div>
          </div>
        )}

        {/* Step 5 — review + start */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">{t('step5')}</h2>
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">{t('trialNotice')}</div>
            <dl className="divide-y divide-gray-100 text-sm">
              <div className="flex justify-between py-2"><dt className="text-gray-500">{t('clinicName')}</dt><dd className="font-medium text-gray-900">{form.clinic_name}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-gray-500">{t('email')}</dt><dd className="font-medium text-gray-900">{form.email}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-gray-500">{t('phone')}</dt><dd className="font-medium text-gray-900">{form.phone}</dd></div>
            </dl>
            <form action={start}>
              <input type="hidden" name="first_name" value={form.first_name} />
              <input type="hidden" name="last_name" value={form.last_name} />
              <input type="hidden" name="email" value={form.email} />
              <input type="hidden" name="password" value={form.password} />
              <input type="hidden" name="phone" value={form.phone} />
              <input type="hidden" name="clinic_name" value={form.clinic_name} />
              <input type="hidden" name="city" value={form.city} />
              <input type="hidden" name="country" value={form.country} />
              <button disabled={starting} className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {starting ? t('creating') : t('startTrial')}
              </button>
            </form>
            {startState.error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{startState.error}</p>}
          </div>
        )}
      </div>

      {/* Nav */}
      {step < 5 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-40"
          >
            {t('back')}
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 1 && !canNext1) ||
              (step === 2 && !emailVerified) ||
              (step === 3 && !phoneVerified) ||
              (step === 4 && !form.clinic_name.trim())
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  )
}
