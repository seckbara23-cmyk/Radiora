'use client'

// Phase 6B.2 — browser capability diagnostic for live dictation. Read-only:
// checks Web Speech API support, microphone permission, language and browser, and
// gives fallback guidance. No recording, no persistence.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isSpeechRecognitionSupported, detectBrowserName } from '@/lib/ai/live-dictation'

type MicState = 'granted' | 'denied' | 'prompt' | 'unknown'

export function DictationDiagnostic({ lang = 'fr-FR' }: { lang?: string }) {
  const t = useTranslations('liveDictation')
  const [speech, setSpeech] = useState<boolean | null>(null)
  const [mic, setMic] = useState<MicState>('unknown')
  const [browser, setBrowser] = useState('—')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSpeech(isSpeechRecognitionSupported(window))
    setBrowser(detectBrowserName(navigator.userAgent))

    // Microphone permission (Permissions API where available; best-effort).
    const perms = navigator.permissions as
      | { query?: (d: { name: PermissionName }) => Promise<PermissionStatus> }
      | undefined
    if (perms?.query) {
      perms
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          setMic(status.state as MicState)
          status.onchange = () => setMic(status.state as MicState)
        })
        .catch(() => setMic('unknown'))
    }
  }, [])

  const ok = (good: boolean) =>
    good ? 'text-emerald-600' : 'text-amber-600'

  const Row = ({ label, value, good }: { label: string; value: string; good: boolean }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok(good)}`}>
        <span aria-hidden>{good ? '✓' : '⚠'}</span>
        {value}
      </span>
    </div>
  )

  const micLabel: Record<MicState, string> = {
    granted: t('diagnostic.micGranted'),
    denied: t('diagnostic.micDenied'),
    prompt: t('diagnostic.micPrompt'),
    unknown: t('diagnostic.micUnknown'),
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('diagnostic.title')}</p>
      <div className="mt-2 divide-y divide-gray-100">
        <Row
          label={t('diagnostic.speechApi')}
          value={speech === null ? '…' : speech ? t('diagnostic.available') : t('diagnostic.unavailable')}
          good={speech === true}
        />
        <Row label={t('diagnostic.mic')} value={micLabel[mic]} good={mic === 'granted' || mic === 'prompt'} />
        <Row label={t('diagnostic.language')} value={lang} good />
        <Row label={t('diagnostic.browser')} value={browser} good={['Chrome', 'Edge', 'Chromium', 'Opera'].includes(browser)} />
      </div>
      {speech === false && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('diagnostic.guidance')}
        </p>
      )}
    </div>
  )
}
