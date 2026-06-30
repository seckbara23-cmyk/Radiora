'use client'

// Phase 6B — reusable live browser-dictation panel.
//
// Radiologist speaks → words appear live → medical cleanup + self-correction +
// HPD structuring preview update live (via the existing F7 engine). NOTHING is
// saved automatically: the transcript is only applied/saved when the user clicks
// the apply button. Reused in the report editor, the vacation item workspace and
// the Dictée vocale workspace.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useSpeechRecognition } from '@/lib/hooks/use-speech-recognition'
import { computeLivePreview, type LivePreview } from '@/lib/ai/live-dictation'
import { saveTranscription } from '@/lib/actions/audio'

interface Props {
  modality?: string | null
  bodyPart?: string | null
  patientName?: string
  patientAge?: string
  patientSex?: string
  /** Client parent apply (e.g. report editor → existing voice/structuring pipeline). */
  onApply?: (text: string) => void
  /** Save the transcript onto a vacation queue item (explicit click only). */
  saveToItemId?: string
}

const SPEECH_LANG: Record<string, string> = { fr: 'fr-FR', en: 'en-US' }

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function LiveDictationPanel({
  modality, bodyPart, patientName, patientAge, patientSex, onApply, saveToItemId,
}: Props) {
  const t = useTranslations('liveDictation')
  const locale = useLocale()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<LivePreview | null>(null)
  const [applied, setApplied] = useState(false)
  const [isSaving, startSave] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { supported, status, transcript, elapsed, start, pause, resume, stop, reset } =
    useSpeechRecognition({ lang: SPEECH_LANG[locale] ?? 'fr-FR', onError: setError })

  // Recompute the live preview ~1.2s after the transcript changes (and at once
  // when recording stops). Pure computation — no persistence.
  useEffect(() => {
    if (!transcript.trim()) { setPreview(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const delay = status === 'stopped' ? 0 : 1200
    debounceRef.current = setTimeout(() => {
      setPreview(computeLivePreview(transcript, { modality, bodyPart, patientName, patientAge, patientSex, locale }))
    }, delay)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [transcript, status, modality, bodyPart, patientName, patientAge, patientSex, locale])

  const appliedText = preview?.result.cleanedTranscript ?? ''
  const canApply = appliedText.trim().length > 0 && !isSaving

  function handleApply() {
    if (!canApply) return
    setError(null)
    if (onApply) {
      onApply(appliedText)
      setApplied(true)
      return
    }
    if (saveToItemId) {
      startSave(async () => {
        const res = await saveTranscription({ itemId: saveToItemId, correctedText: appliedText, rawText: preview?.raw })
        if (res.error) { setError(res.error); return }
        setApplied(true)
        router.refresh()
      })
      return
    }
    // No apply target → copy to clipboard.
    navigator.clipboard?.writeText(appliedText).then(() => setApplied(true)).catch(() => {})
  }

  function handleReset() {
    reset()
    setPreview(null)
    setApplied(false)
    setError(null)
  }

  const applyLabel = onApply ? t('applyToReport') : saveToItemId ? t('useTranscript') : t('copyTranscript')
  const structured = preview?.result.structured
  const sections: Array<{ key: string; label: string; value: string }> = structured
    ? [
        { key: 'indication', label: t('hpd.indication'), value: structured.indication },
        { key: 'technique',  label: t('hpd.technique'),  value: structured.technique },
        { key: 'results',    label: t('hpd.results'),    value: structured.results },
        { key: 'conclusion', label: t('hpd.conclusion'), value: structured.conclusion },
      ]
    : []

  const isRecording = status === 'recording'
  const isPaused = status === 'paused'

  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50/30">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-blue-50/60"
      >
        <div className="flex items-center gap-2.5">
          <svg className="h-4 w-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8" />
          </svg>
          <span className="text-sm font-semibold text-blue-900">{t('title')}</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">{t('badge')}</span>
        </div>
        <svg className={`h-4 w-4 text-blue-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4 border-t border-blue-200 px-5 py-4">
          {/* Privacy note */}
          <p className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-xs text-blue-800">
            🔒 {t('privacy')}
          </p>

          {/* Unsupported browser → fallback message, no live dictation */}
          {supported === false ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              {t('unsupported')}
            </p>
          ) : (
            <>
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {status === 'idle' && (
                  <button type="button" onClick={start}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" /></svg>
                    {t('start')}
                  </button>
                )}
                {(isRecording || isPaused) && (
                  <>
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className={`relative flex h-3 w-3 ${isRecording ? '' : 'opacity-40'}`}>
                        {isRecording && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />}
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                      </span>
                      <span className="font-mono font-medium text-gray-700">{formatDuration(elapsed)}</span>
                      <span className="text-xs text-gray-400">{isRecording ? t('listening') : t('paused')}</span>
                    </span>
                    {isRecording ? (
                      <button type="button" onClick={pause} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t('pause')}</button>
                    ) : (
                      <button type="button" onClick={resume} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t('resume')}</button>
                    )}
                    <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                      {t('stop')}
                    </button>
                  </>
                )}
                {status === 'stopped' && (
                  <button type="button" onClick={handleReset} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t('restart')}</button>
                )}
              </div>

              {error && <p className="text-xs text-red-600">{t('micError', { error })}</p>}

              {/* Raw + cleaned transcript panels */}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('rawTitle')}</p>
                  <div className="min-h-[5rem] whitespace-pre-wrap rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
                    {transcript || <span className="italic text-gray-300">{t('speakNow')}</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('cleanedTitle')}</p>
                  <div className="min-h-[5rem] whitespace-pre-wrap rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800">
                    {preview?.result.cleanedTranscript || <span className="italic text-gray-300">—</span>}
                  </div>
                </div>
              </div>

              {/* Medical term corrections (highlighted) */}
              {preview && preview.termCorrections.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                    {t('correctionsTitle')} ({preview.termCorrections.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {preview.termCorrections.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-xs">
                        <span className="text-red-400 line-through">{c.original}</span>
                        <span className="mx-0.5 text-gray-300">→</span>
                        <span className="font-medium text-blue-700">{c.replacement}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Self-correction events */}
              {preview && preview.result.correctionEvents.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{t('selfCorrectionsTitle')}</p>
                  <ul className="mt-2 space-y-1">
                    {preview.result.correctionEvents.map((e, i) => (
                      <li key={i} className="text-[11px] text-gray-600">
                        <span className="rounded bg-gray-200 px-1 font-mono text-[10px] text-gray-700">{e.marker}</span>{' '}
                        <span className="text-red-500 line-through">{e.removed || '—'}</span>{' → '}
                        <span className="text-green-700">{e.kept}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Live HPD preview */}
              {structured && (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('hpd.title')}</p>
                  <p className="mt-1 text-xs font-semibold text-gray-900">{structured.examTitle}</p>
                  <div className="mt-2 space-y-2">
                    {sections.map((s) => (
                      <div key={s.key}>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{s.label}</span>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                          {s.value || <span className="italic text-gray-300">{t('hpd.empty')}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply (the ONLY persistence/handoff point) */}
              <div className="flex flex-wrap items-center gap-3 border-t border-blue-100 pt-3">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? t('applying') : applyLabel}
                </button>
                {applied && <span className="text-sm text-green-600">{t('applied')}</span>}
                <span className="text-xs text-gray-400">{t('noAutoSave')}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
