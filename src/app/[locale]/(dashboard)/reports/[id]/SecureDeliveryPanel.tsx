'use client'

// F17 — STAFF secure-delivery panel (shown only for validated reports).
// Creates secure links (optionally to "patient" / "médecin traitant"), copies the
// secure URL, and revokes links. Sending never transmits PHI externally — it
// records an in-app secure link + audit trail.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createDelivery, revokeDelivery } from '@/lib/actions/deliveries'
import { deliveryState } from '@/lib/delivery/policy'
import type { ReportDelivery } from '@/types/delivery'

interface Props {
  reportId: string
  locale: string
  headers: { id: string; name: string }[]
  deliveries: ReportDelivery[]
  nowISO: string
}

export function SecureDeliveryPanel({ reportId, locale, headers, deliveries, nowISO }: Props) {
  const t = useTranslations('delivery')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [channel, setChannel] = useState<'patient' | 'physician' | 'link'>('patient')
  const [recipient, setRecipient] = useState('')
  const [header, setHeader] = useState('')
  const [passwordKind, setPasswordKind] = useState<'none' | 'dob' | 'custom'>('dob')
  const [customPassword, setCustomPassword] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<number>(30)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function secureUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/${locale}/r/${token}`
  }

  function handleCreate() {
    setError('')
    startTransition(async () => {
      const res = await createDelivery({
        reportId,
        channel,
        recipientLabel: recipient,
        header,
        passwordKind,
        customPassword,
        expiresInDays: expiresInDays > 0 ? expiresInDays : null,
      })
      if (!res.ok) {
        setError(t(`errors.${res.error}` as Parameters<typeof t>[0]))
        return
      }
      setRecipient('')
      setCustomPassword('')
      router.refresh()
      if (res.token) {
        try {
          await navigator.clipboard.writeText(secureUrl(res.token))
        } catch {
          /* clipboard may be unavailable */
        }
      }
    })
  }

  function handleCopy(token: string, id: string) {
    navigator.clipboard
      .writeText(secureUrl(token))
      .then(() => {
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      })
      .catch(() => {})
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeDelivery(id, reportId)
      router.refresh()
    })
  }

  const channelLabel: Record<string, string> = {
    patient: t('channel.patient'),
    physician: t('channel.physician'),
    link: t('channel.link'),
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-900">{t('panelTitle')}</h2>
      <p className="mt-1 text-sm text-gray-500">{t('panelSubtitle')}</p>

      {/* Create form */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('form.recipientType')}</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="patient">{t('channel.patient')}</option>
            <option value="physician">{t('channel.physician')}</option>
            <option value="link">{t('channel.link')}</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('form.recipientLabel')}</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={t('form.recipientPlaceholder')}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('form.header')}</span>
          <select
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">{t('form.headerDefault')}</option>
            <option value="none">{t('form.headerNone')}</option>
            {headers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('form.expiry')}</span>
          <select
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value={7}>{t('form.expiry7')}</option>
            <option value={30}>{t('form.expiry30')}</option>
            <option value={0}>{t('form.expiryNever')}</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('form.password')}</span>
          <select
            value={passwordKind}
            onChange={(e) => setPasswordKind(e.target.value as typeof passwordKind)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="dob">{t('form.passwordDob')}</option>
            <option value="custom">{t('form.passwordCustom')}</option>
            <option value="none">{t('form.passwordNone')}</option>
          </select>
        </label>

        {passwordKind === 'custom' && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">{t('form.customPassword')}</span>
            <input
              value={customPassword}
              onChange={(e) => setCustomPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <button
          onClick={handleCreate}
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? t('form.creating') : t('form.create')}
        </button>
      </div>

      {/* Existing deliveries */}
      {deliveries.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700">{t('list.title')}</h3>
          <ul className="mt-3 space-y-2">
            {deliveries.map((d) => {
              const state = deliveryState(d.expiresAt, d.revokedAt, nowISO)
              const stateColor =
                state === 'active'
                  ? 'bg-green-100 text-green-700'
                  : state === 'expired'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-200 text-gray-600'
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-gray-800">{channelLabel[d.channel]}</span>
                  {d.recipientLabel && <span className="text-gray-500">· {d.recipientLabel}</span>}
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${stateColor}`}>
                    {t(`state.${state}` as Parameters<typeof t>[0])}
                  </span>
                  {d.hasPassword && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {t(`passwordTag.${d.passwordKind}` as Parameters<typeof t>[0])}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {t('list.opened')}: {d.openedCount} · {t('list.downloaded')}: {d.downloadCount}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {state === 'active' && (
                      <>
                        <button
                          onClick={() => handleCopy(d.token, d.id)}
                          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {copiedId === d.id ? t('list.copied') : t('list.copyLink')}
                        </button>
                        <button
                          onClick={() => handleRevoke(d.id)}
                          disabled={pending}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {t('list.revoke')}
                        </button>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
