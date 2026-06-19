'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addHospitalHeader,
  toggleHospitalHeader,
  deleteHospitalHeader,
  type HeaderFormState,
} from '@/lib/actions/hospital-headers'
import type { HospitalHeader } from '@/types/hospital-header'

const INITIAL: HeaderFormState = { error: null }

export function HospitalHeadersClient({
  headers,
  clinicId,
  isAdmin,
}: {
  headers: HospitalHeader[]
  clinicId: string | null
  isAdmin: boolean
}) {
  const t = useTranslations('hospitalHeaders')

  return (
    <div className="space-y-6">
      {headers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-400">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {headers.map((h) => (
            <HeaderCard
              key={h.id}
              header={h}
              owned={isAdmin && h.clinicId === clinicId && clinicId != null}
              t={t}
            />
          ))}
        </div>
      )}

      {isAdmin && <AddHeaderForm t={t} />}
    </div>
  )
}

function HeaderCard({
  header,
  owned,
  t,
}: {
  header: HospitalHeader
  owned: boolean
  t: ReturnType<typeof useTranslations>
}) {
  const contact = [header.phone && `Tél : ${header.phone}`, header.email].filter(Boolean).join('   ·   ')
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 ${header.isActive ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {header.overline && (
            <p className="whitespace-pre-line text-[11px] uppercase tracking-wide text-gray-400">
              {header.overline}
            </p>
          )}
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{header.name}</h3>
          {header.department && <p className="text-xs text-gray-600">{header.department}</p>}
          {header.subtitle && <p className="mt-0.5 text-xs text-gray-500">{header.subtitle}</p>}
          {header.address && <p className="mt-0.5 text-xs text-gray-500">{header.address}</p>}
          {contact && <p className="mt-0.5 text-xs text-gray-500">{contact}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {header.clinicId === null && (
              <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {t('badgeGlobal')}
              </span>
            )}
            {!header.isActive && (
              <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                {t('badgeInactive')}
              </span>
            )}
          </div>
        </div>
        {owned && (
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <ToggleHeader id={header.id} isActive={header.isActive} t={t} />
            <DeleteHeader id={header.id} t={t} />
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleHeader({ id, isActive, t }: { id: string; isActive: boolean; t: ReturnType<typeof useTranslations> }) {
  const [state, formAction, isPending] = useActionState(toggleHospitalHeader, INITIAL)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activate" value={isActive ? '0' : '1'} />
      {state.error && <p className="mb-1 text-[11px] text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className={`text-xs font-medium transition ${
          isActive ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'
        }`}
      >
        {isPending ? '…' : isActive ? t('deactivate') : t('reactivate')}
      </button>
    </form>
  )
}

function DeleteHeader({ id, t }: { id: string; t: ReturnType<typeof useTranslations> }) {
  const [state, formAction, isPending] = useActionState(deleteHospitalHeader, INITIAL)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {state.error && <p className="mb-1 text-[11px] text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-gray-300 transition hover:text-red-600"
      >
        {isPending ? '…' : t('delete')}
      </button>
    </form>
  )
}

function AddHeaderForm({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [state, formAction, isPending] = useActionState(addHospitalHeader, INITIAL)
  const input =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">{t('addTitle')}</h2>
      <p className="mt-1 text-xs text-gray-500">{t('addHint')}</p>
      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('fieldName')} *</span>
          <input name="name" required className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('fieldOverline')}</span>
          <textarea name="overline" rows={2} className={input} placeholder={t('overlineHint')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldDepartment')}</span>
            <input name="department" className={input} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldSubtitle')}</span>
            <input name="subtitle" className={input} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldPhone')}</span>
            <input name="phone" className={input} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldEmail')}</span>
            <input name="email" type="email" className={input} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('fieldAddress')}</span>
          <input name="address" className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('fieldLogo')}</span>
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          <span className="mt-1 block text-[11px] text-gray-400">{t('logoHint')}</span>
        </label>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.saved && <p className="text-xs text-green-600">{t('added')}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? '…' : t('add')}
        </button>
      </form>
    </section>
  )
}
