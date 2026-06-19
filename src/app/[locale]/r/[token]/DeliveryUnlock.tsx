'use client'

// F17 — public client island: optional password gate + download buttons.
// The secret token already lives in the URL; once unlocked we pass the password
// as a query param to the file route, which re-verifies it on every download.

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
  const pwQs = password ? `&pw=${encodeURIComponent(password)}` : ''
  const pdfHref = `${base}?format=pdf${pwQs}`
  const docxHref = `${base}?format=docx${pwQs}`

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
        setUnlocked(true)
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
