'use client'

// R2.7 — the phone handoff, as the doctor sees it.
//
// The phone is a microphone for THIS report, not a second workflow. Nothing on
// this panel names a session, a token, a capability, a queue item or a database
// status — the vocabulary is entirely clinical, and every stage string comes
// from the `phone` i18n namespace.
//
// Status is announced through aria-live and carries an icon plus text, never
// colour alone.

import { useTranslations } from 'next-intl'
import {
  formatRemaining,
  isLiveStage,
  needsNewSession,
  type PhoneHandoffStage,
} from '@/lib/dictation/session-status'

interface Props {
  stage: PhoneHandoffStage
  qrSvg: string | null
  /** Seconds left on the link; 0 hides the countdown. */
  secondsLeft: number
  /** What the phone reported itself as, e.g. "iOS · Safari". */
  deviceLabel?: string
  busy: boolean
  onCancel: () => void
  onRestart: () => void
}

/** A dot plus a word — never colour on its own (§17). */
function StageBadge({ stage, label }: { stage: PhoneHandoffStage; label: string }) {
  const tone: Record<PhoneHandoffStage, string> = {
    waiting:   'border-gray-300 bg-gray-50 text-gray-700',
    connected: 'border-blue-300 bg-blue-50 text-blue-800',
    recording: 'border-red-300 bg-red-50 text-red-800',
    received:  'border-green-300 bg-green-50 text-green-800',
    expired:   'border-amber-300 bg-amber-50 text-amber-800',
    cancelled: 'border-gray-300 bg-gray-50 text-gray-600',
  }
  const dot: Record<PhoneHandoffStage, string> = {
    waiting: 'bg-gray-400', connected: 'bg-blue-500', recording: 'bg-red-500',
    received: 'bg-green-600', expired: 'bg-amber-500', cancelled: 'bg-gray-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone[stage]}`}>
      <span
        className={`h-2 w-2 rounded-full ${dot[stage]} ${stage === 'recording' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

export function PhoneHandoffPanel({
  stage, qrSvg, secondsLeft, deviceLabel, busy, onCancel, onRestart,
}: Props) {
  const t = useTranslations('phone')
  const stageLabel = t(`stage.${stage}` as Parameters<typeof t>[0])
  const showQr = isLiveStage(stage) && Boolean(qrSvg)

  return (
    <section
      className="mt-3 rounded-xl border border-gray-200 bg-white p-4"
      aria-labelledby="phone-handoff-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="phone-handoff-heading" className="text-sm font-semibold text-gray-900">
          {t('title')}
        </h3>
        <StageBadge stage={stage} label={stageLabel} />
      </div>

      {/* One live region for the whole handoff, so a screen reader hears each
          transition once rather than re-reading the panel. */}
      <p className="sr-only" role="status" aria-live="polite">
        {stageLabel}{deviceLabel ? ` — ${deviceLabel}` : ''}
      </p>

      {showQr && (
        <>
          <p className="mt-2 text-sm text-gray-600">{t('scanInstruction')}</p>
          <div className="mt-3 flex justify-center">
            <div
              className="rounded-lg border border-gray-200 p-2 [&>svg]:h-auto [&>svg]:w-[200px]"
              role="img"
              aria-label={t('qrAlt')}
              /* Server-generated SVG from the local qrcode package — the QR
                 encodes only the opaque one-time URL, no patient data. */
              dangerouslySetInnerHTML={{ __html: qrSvg! }}
            />
          </div>

          {secondsLeft > 0 && (
            <p className="mt-2 text-center text-xs text-gray-500 tabular-nums">
              {t('expiresIn', { time: formatRemaining(secondsLeft) })}
            </p>
          )}

          {deviceLabel && stage !== 'waiting' && (
            <p className="mt-1 text-center text-xs text-gray-500">{deviceLabel}</p>
          )}
        </>
      )}

      {stage === 'received' && (
        <p className="mt-2 text-sm text-gray-600">{t('receivedBody')}</p>
      )}

      {needsNewSession(stage) && (
        <p className="mt-2 text-sm text-gray-600">
          {stage === 'expired' ? t('expiredBody') : t('cancelledBody')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {isLiveStage(stage) && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
        )}
        {needsNewSession(stage) && (
          <button
            type="button"
            onClick={onRestart}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            {t('newSession')}
          </button>
        )}
      </div>
    </section>
  )
}
