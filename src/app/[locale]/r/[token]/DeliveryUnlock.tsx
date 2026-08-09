'use client'

// F17 — public client island: optional password gate + download buttons.
//
// R0.5 — the password is submitted ONCE to /unlock, which replies with a
// short-lived HttpOnly grant cookie scoped to this delivery. Download links no
// longer carry `?pw=`, so the patient's date of birth never reaches a server
// log, a proxy, the browser history or a Referer header.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PasswordKind } from '@/lib/delivery/policy'

interface Props {
  token: string
  requiresPassword: boolean
  passwordKind: PasswordKind
}

export function DeliveryUnlock({ token, requiresPassword, passwordKind }: Props) {
  const t = useTranslations('delivery')
  const [unlocked, setUnlocked] = useState(!requiresPassword)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const base = `/api/delivery/${encodeURIComponent(token)}/file`
  const pdfHref = `${base}?format=pdf`
  const docxHref = `${base}?format=docx`

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/delivery/${encodeURIComponent(token)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        // The grant cookie is set by the response; clear the password from
        // client state so it does not linger in memory or a form value.
        setPassword('')
        setUnlocked(true)
      } else if (res.status === 429) {
        setError(t('unlock.locked'))
      } else {
        setError(t('unlock.wrong'))
      }
    } catch {
      setError(t('unlock.wrong'))
    } finally {
      setBusy(false)
    }
  }

  if (!unlocked) {
    return (
      <form onSubmit={handleUnlock} className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {passwordKind === 'dob' ? t('unlock.dobLabel') : t('unlock.passwordLabel')}
        </label>
        <input
          type={passwordKind === 'dob' ? 'text' : 'password'}
          inputMode={passwordKind === 'dob' ? 'numeric' : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={passwordKind === 'dob' ? t('unlock.dobPlaceholder') : ''}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? t('unlock.checking') : t('unlock.submit')}
        </button>
      </form>
    )
  }

  return (
    <div className="mt-6 space-y-3">
      <a
        href={pdfHref}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        {t('download.pdf')}
      </a>
      <a
        href={docxHref}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {t('download.docx')}
      </a>
    </div>
  )
}
