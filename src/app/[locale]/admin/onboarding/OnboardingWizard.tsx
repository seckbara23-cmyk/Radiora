'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { createTenant, type CreateTenantState } from '@/lib/actions/platform'

const INITIAL: CreateTenantState = { error: null }

const FIELD =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const LABEL = 'block text-sm font-medium text-gray-700'

export function OnboardingWizard() {
  const t = useTranslations('admin')
  const router = useRouter()
  const [state, action, pending] = useActionState(createTenant, INITIAL)
  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    clinic_name: '',
    slug: '',
    city: '',
    country: 'SN',
    phone: '',
    clinic_email: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
    admin_password: '',
    logo_url: '',
    report_header: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // On success the action returns the new clinic id — navigate to its detail.
  useEffect(() => {
    if (state.clinicId) router.push(`/admin/clinics/${state.clinicId}`)
  }, [state.clinicId, router])

  const canNext1 = form.clinic_name.trim().length > 0
  const canNext2 =
    form.admin_first_name.trim() &&
    form.admin_last_name.trim() &&
    form.admin_email.trim() &&
    form.admin_password.length >= 8

  const steps = [t('onboarding.step1'), t('onboarding.step2'), t('onboarding.step3'), t('onboarding.step4')]

  return (
    <form action={action} className="space-y-6">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-xs">
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
              {n < steps.length && <span className="text-gray-300">—</span>}
            </li>
          )
        })}
      </ol>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {/* Step 1 — clinic */}
        <div className={step === 1 ? 'space-y-4' : 'hidden'}>
          <h2 className="text-sm font-semibold text-gray-900">{t('onboarding.step1')}</h2>
          <div>
            <label className={LABEL}>{t('onboarding.clinicName')}</label>
            <input name="clinic_name" value={form.clinic_name} onChange={set('clinic_name')} className={FIELD} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>{t('onboarding.slug')}</label>
              <input name="slug" value={form.slug} onChange={set('slug')} placeholder={t('onboarding.slugHint')} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t('onboarding.city')}</label>
              <input name="city" value={form.city} onChange={set('city')} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t('onboarding.country')}</label>
              <input name="country" value={form.country} onChange={set('country')} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t('onboarding.phone')}</label>
              <input name="phone" value={form.phone} onChange={set('phone')} className={FIELD} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>{t('onboarding.clinicEmail')}</label>
              <input name="clinic_email" type="email" value={form.clinic_email} onChange={set('clinic_email')} className={FIELD} />
            </div>
          </div>
        </div>

        {/* Step 2 — admin */}
        <div className={step === 2 ? 'space-y-4' : 'hidden'}>
          <h2 className="text-sm font-semibold text-gray-900">{t('onboarding.step2')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>{t('onboarding.firstName')}</label>
              <input name="admin_first_name" value={form.admin_first_name} onChange={set('admin_first_name')} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t('onboarding.lastName')}</label>
              <input name="admin_last_name" value={form.admin_last_name} onChange={set('admin_last_name')} className={FIELD} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>{t('onboarding.adminEmail')}</label>
              <input name="admin_email" type="email" value={form.admin_email} onChange={set('admin_email')} className={FIELD} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>{t('onboarding.password')}</label>
              <input name="admin_password" type="password" value={form.admin_password} onChange={set('admin_password')} className={FIELD} />
              <p className="mt-1 text-xs text-gray-400">{t('onboarding.passwordHint')}</p>
            </div>
          </div>
        </div>

        {/* Step 3 — branding */}
        <div className={step === 3 ? 'space-y-4' : 'hidden'}>
          <h2 className="text-sm font-semibold text-gray-900">{t('onboarding.step3')}</h2>
          <p className="text-xs text-gray-400">{t('onboarding.brandingOptional')}</p>
          <div>
            <label className={LABEL}>{t('onboarding.logoUrl')}</label>
            <input name="logo_url" value={form.logo_url} onChange={set('logo_url')} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>{t('onboarding.reportHeader')}</label>
            <textarea name="report_header" value={form.report_header} onChange={set('report_header')} rows={3} className={FIELD} />
          </div>
        </div>

        {/* Step 4 — review */}
        <div className={step === 4 ? 'space-y-4' : 'hidden'}>
          <h2 className="text-sm font-semibold text-gray-900">{t('onboarding.step4')}</h2>
          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {t('onboarding.trialNotice')}
          </div>
          <dl className="divide-y divide-gray-100 text-sm">
            <div className="flex justify-between py-2"><dt className="text-gray-500">{t('onboarding.clinicName')}</dt><dd className="font-medium text-gray-900">{form.clinic_name}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-gray-500">{t('onboarding.adminEmail')}</dt><dd className="font-medium text-gray-900">{form.admin_email}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-gray-500">{t('detail.plan')}</dt><dd className="font-medium text-gray-900">Professional · {t('onboarding.trial30')}</dd></div>
          </dl>
        </div>

        {state.error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-40"
        >
          {t('onboarding.back')}
        </button>

        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {t('onboarding.next')}
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? t('onboarding.creating') : t('onboarding.activate')}
          </button>
        )}
      </div>
    </form>
  )
}
