'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { updateMyProfile, type ProfileFormState } from '@/lib/actions/profile'
import { buildSignatureName, type SignatureStyle } from '@/lib/profile/signature'
import type { RadiologistProfile } from '@/types/profile'

const INITIAL: ProfileFormState = { error: null }

export function ProfileForm({ profile }: { profile: RadiologistProfile }) {
  const t = useTranslations('profileSettings')
  const [state, formAction, isPending] = useActionState(updateMyProfile, INITIAL)

  // Live preview state — mirrors the fields that feed the signature line.
  const [firstName, setFirstName] = useState(profile.firstName)
  const [lastName, setLastName] = useState(profile.lastName)
  const [titlePrefix, setTitlePrefix] = useState(profile.titlePrefix || 'Dr')
  const [style, setStyle] = useState<SignatureStyle>(profile.signatureStyle)
  const [custom, setCustom] = useState(profile.signatureCustom)

  const preview =
    buildSignatureName({ titlePrefix, firstName, lastName, style, custom }) || t('previewEmpty')

  const input =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const label = 'block'
  const labelText = 'text-xs font-medium text-gray-700'

  return (
    <form action={formAction} className="space-y-6">
      {/* ── Identity ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('identityTitle')}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span className={labelText}>{t('lastName')} *</span>
            <input
              name="last_name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={input}
            />
          </label>
          <label className={label}>
            <span className={labelText}>{t('firstName')} *</span>
            <input
              name="first_name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={input}
            />
          </label>
          <label className={label}>
            <span className={labelText}>{t('email')}</span>
            <input value={profile.email} disabled className={`${input} bg-gray-50 text-gray-500`} />
          </label>
          <label className={label}>
            <span className={labelText}>{t('phone')}</span>
            <input name="phone" defaultValue={profile.phone} className={input} />
          </label>
          <label className={label}>
            <span className={labelText}>{t('institution')}</span>
            <input name="institution" defaultValue={profile.institution} className={input} />
          </label>
          <label className={label}>
            <span className={labelText}>{t('country')}</span>
            <input name="country" defaultValue={profile.country} className={input} />
          </label>
          <label className={label}>
            <span className={labelText}>{t('specialty')}</span>
            <input name="specialty" defaultValue={profile.specialty} className={input} />
          </label>
          <label className={label}>
            <span className={labelText}>{t('licenseNumber')}</span>
            <input name="license_number" defaultValue={profile.licenseNumber} className={input} />
          </label>
        </div>
      </section>

      {/* ── Signature ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('signatureTitle')}</h2>
        <p className="mt-1 text-xs text-gray-500">{t('signatureHint')}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span className={labelText}>{t('titlePrefix')}</span>
            <select
              name="title_prefix"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              className={input}
            >
              <option value="Dr">{t('prefixDr')}</option>
              <option value="Pr">{t('prefixPr')}</option>
            </select>
          </label>
          <label className={label}>
            <span className={labelText}>{t('signatureStyle')}</span>
            <select
              name="signature_style"
              value={style}
              onChange={(e) => setStyle(e.target.value as SignatureStyle)}
              className={input}
            >
              <option value="full">{t('styleFull')}</option>
              <option value="initials_surname">{t('styleInitials')}</option>
              <option value="custom">{t('styleCustom')}</option>
            </select>
          </label>
        </div>

        {style === 'custom' && (
          <label className={`${label} mt-3`}>
            <span className={labelText}>{t('customLabel')}</span>
            <input
              name="signature_custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t('customPlaceholder')}
              className={input}
            />
          </label>
        )}
        {/* Keep the value submitted even when the field is hidden. */}
        {style !== 'custom' && <input type="hidden" name="signature_custom" value={custom} />}

        <label className={`${label} mt-3`}>
          <span className={labelText}>{t('professionalTitle')}</span>
          <input
            name="signature_title"
            defaultValue={profile.signatureTitle}
            placeholder={t('professionalTitlePlaceholder')}
            className={input}
          />
        </label>

        {/* Live preview of the auto-inserted signature line. */}
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            {t('previewLabel')}
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{preview}</p>
        </div>
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-600">{t('saved')}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? '…' : t('save')}
      </button>
    </form>
  )
}
