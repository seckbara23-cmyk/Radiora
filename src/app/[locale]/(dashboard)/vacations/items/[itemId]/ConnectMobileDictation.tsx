'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import {
  createDictationSession,
  getDictationSessionStatus,
  cancelDictationSession,
  type CreateSessionResult,
} from '@/lib/actions/dictation'
import type { DictationSessionStatus } from '@/types/dictation'

/**
 * Desktop side of phone-as-dictation-device. The user clicks "Connect mobile
 * dictation", we mint a capability token + QR, and poll the session until the
 * phone uploads — then refresh so the new audio appears on the page.
 */
export function ConnectMobileDictation({ itemId }: { itemId: string }) {
  const t = useTranslations('mobileDictation')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [session, setSession] = useState<CreateSessionResult | null>(null)
  const [status, setStatus] = useState<DictationSessionStatus>('pending')
  const [deviceLabel, setDeviceLabel] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => stopPolling, [])

  function open() {
    setError(null)
    start(async () => {
      const res = await createDictationSession(itemId)
      if (res.error) { setError(res.error); return }
      setSession(res)
      setStatus('pending')
      setDeviceLabel(undefined)
    })
  }

  // Poll while a session is live and not yet completed.
  useEffect(() => {
    if (!session?.sessionId) return
    if (status === 'completed') return
    pollRef.current = setInterval(async () => {
      const res = await getDictationSessionStatus(session.sessionId!)
      if (res.error || !res.status) return
      setStatus(res.status)
      if (res.deviceLabel) setDeviceLabel(res.deviceLabel)
      if (res.status === 'completed') {
        stopPolling()
        // The phone's upload landed the audio; refresh to render it.
        router.refresh()
      }
      if (res.status === 'expired' || res.status === 'cancelled') stopPolling()
    }, 2500)
    return stopPolling
  }, [session?.sessionId, status, router])

  function close() {
    stopPolling()
    if (session?.sessionId && status !== 'completed') {
      void cancelDictationSession(session.sessionId)
    }
    setSession(null)
  }

  if (!session) {
    return (
      <div className="space-y-2">
        <button
          onClick={open}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 transition disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M11 5H6a2 2 0 00-2 2v10a2 2 0 002 2h5m0-14h7a2 2 0 012 2v10a2 2 0 01-2 2h-7m0-14v14M9 12h.01" />
          </svg>
          {pending ? t('preparing') : t('connectPhone')}
        </button>
        <p className="text-xs text-gray-400">{t('connectHint')}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  const completed = status === 'completed'
  const dead = status === 'expired' || status === 'cancelled'

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {!completed && !dead && (
          <div
            className="shrink-0 rounded-lg bg-white p-2 shadow-sm [&>svg]:h-40 [&>svg]:w-40"
            // QR SVG is generated server-side from our own URL (no external service).
            dangerouslySetInnerHTML={{ __html: session.qrSvg ?? '' }}
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {completed ? (
            <div className="flex items-center gap-2 text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">{t('received')}</span>
            </div>
          ) : dead ? (
            <p className="text-sm text-gray-500">{t(status === 'expired' ? 'expired' : 'cancelled')}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-800">{t('scanToConnect')}</p>
              <p className="text-xs text-gray-500">{t('scanHint')}</p>
              <div className="flex items-center gap-2 pt-1">
                <span className={`inline-block h-2 w-2 rounded-full ${status === 'pending' ? 'bg-gray-400' : 'bg-green-500 animate-pulse'}`} />
                <span className="text-xs text-gray-600">
                  {status === 'pending' && t('statusPending')}
                  {status === 'connected' && t('statusConnected')}
                  {status === 'recording' && t('statusRecording')}
                </span>
                {deviceLabel && <span className="truncate text-xs text-gray-400">· {deviceLabel}</span>}
              </div>
              <p className="break-all pt-1 font-mono text-[11px] text-gray-400">{session.url}</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={close} className="text-xs font-medium text-gray-500 hover:text-gray-700">
          {completed ? t('done') : t('cancel')}
        </button>
      </div>
    </div>
  )
}
