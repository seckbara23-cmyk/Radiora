'use client'

// R2.3 — the unified dictation workspace.
//
// Replaces the three technical accordions the doctor used to choose between
// ("Classic recording", "Live dictation", "AI Structuring") with ONE clinical
// question — how would you like to dictate? — and one flow behind it:
//
//   dictate / import  →  transcript  →  structure  →  review
//
// Everything underneath is existing, audited infrastructure:
//   • useSpeechRecognition        — the single browser STT binding (no third one)
//   • createReportDictationSession — R2.2 report-owned QR pairing
//   • importReportAudio            — the private dictation-audio bucket
//   • saveReportTranscript         — report-owned transcript (migration 044)
//   • structureReportTranscript    — the canonical runStructuring pipeline
//
// SAFETY: interim speech is NEVER written into clinical report sections. The
// live transcript is displayed as transcript only; structuring runs on a
// COMPLETE transcript the doctor has stopped and reviewed, and the resulting
// draft is applied by the radiologist, not automatically.

import { useState, useTransition, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useSpeechRecognition } from '@/lib/hooks/use-speech-recognition'
import {
  createReportDictationSession,
  getDictationSessionStatus,
  cancelDictationSession,
} from '@/lib/actions/dictation'
import {
  saveReportTranscript,
  structureReportTranscript,
  importReportAudio,
} from '@/lib/actions/report-dictation'
import {
  workspaceReducer,
  canStructure,
  isBusy,
  type WorkspaceState,
  type DictationMethod,
} from '@/lib/reports/workspace-state'
import {
  emptyTranscriptState,
  commitFinalized,
  setInterim,
  finalizeRecording,
  canonicalTranscript,
  type TranscriptState,
} from '@/lib/dictation/transcript-stability'
import type { StructuredReportData } from '@/types/report'
import type { HpdStructuringMeta } from '@/lib/ai/hpd-draft'

interface Props {
  reportId: string
  /** Transcript already stored for this report, if any. */
  initialTranscript?: string
  /** Applies the structured draft to the editor (radiologist action). */
  onApply: (data: StructuredReportData) => void
}

const METHODS: { key: DictationMethod; icon: string }[] = [
  { key: 'computer', icon: '🎙' },
  { key: 'phone',    icon: '📱' },
  { key: 'import',   icon: '📁' },
]

export function DictationWorkspace({ reportId, initialTranscript = '', onApply }: Props) {
  const t = useTranslations('workspace')

  const [state, setState] = useState<WorkspaceState>(
    initialTranscript.trim() ? 'transcription_ready' : 'ready_to_dictate',
  )
  const [method, setMethod] = useState<DictationMethod | null>(null)
  const [transcript, setTranscript] = useState(initialTranscript)
  const [draft, setDraft] = useState<StructuredReportData | null>(null)
  const [meta, setMeta] = useState<HpdStructuringMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<{ svg: string; sessionId: string; expiresAt: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const send = (event: Parameters<typeof workspaceReducer>[1]) =>
    setState((s) => workspaceReducer(s, event))

  // R2.4 — settled speech is separated from the live guess. `live` holds only
  // COMMITTED segments; the interim guess stays in the recogniser hook, is
  // display-only, and can never reach a clinical section.
  const [live, setLive] = useState<TranscriptState>(emptyTranscriptState)

  // Committing is an event (the recogniser settled more speech), not a
  // synchronisation, so it reduces here rather than in an effect.
  const speech = useSpeechRecognition({
    lang: 'fr-FR',
    onFinalText: (cumulative) =>
      setLive((prev) =>
        commitFinalized(prev, cumulative, { source: 'computer', now: new Date().toISOString() }),
      ),
  })

  // ── Workstation microphone ─────────────────────────────────────────────────
  function startComputer() {
    setError(null)
    setMethod('computer')
    if (!speech.supported) {
      setError(t('errors.unsupportedBrowser'))
      return
    }
    setLive(emptyTranscriptState())
    send({ type: 'CHOOSE_METHOD', method: 'computer' })
    speech.start()
  }

  function stopComputer() {
    speech.stop()
    send({ type: 'RECORDING_STOPPED' })

    // Flush: anything still settled becomes a committed segment; an unfinished
    // clause (a dangling "Je corrige", an incomplete measurement) comes back as
    // `pending` and is appended verbatim rather than frozen as clinical text or
    // silently discarded. The doctor edits it in the transcript box.
    const { state: flushed, pending } = finalizeRecording(
      setInterim(
        commitFinalized(live, speech.finalText, { source: 'computer', now: new Date().toISOString() }),
        speech.interimText,
      ),
      { source: 'computer', now: new Date().toISOString() },
    )
    setLive(flushed)

    const committed = canonicalTranscript(flushed)
    const text = [committed, pending].filter(Boolean).join(' ').trim()

    // The browser yields text, not audio: no audio asset is fabricated here.
    // The transcript itself is the record.
    if (!text) { send({ type: 'FAIL' }); setError(t('errors.noSpeech')); return }
    setTranscript(text)
    startTransition(async () => {
      const res = await saveReportTranscript(reportId, text)
      if (res.error) { setError(res.error); send({ type: 'FAIL' }); return }
      send({ type: 'TRANSCRIPT_READY' })
    })
  }

  // ── Phone via QR ───────────────────────────────────────────────────────────
  function startPhone() {
    setError(null)
    setMethod('phone')
    startTransition(async () => {
      const res = await createReportDictationSession(reportId)
      if (res.error || !res.qrSvg || !res.sessionId) {
        setError(res.error ?? t('errors.qrFailed'))
        send({ type: 'FAIL' })
        return
      }
      setQr({ svg: res.qrSvg, sessionId: res.sessionId, expiresAt: res.expiresAt ?? '' })
      send({ type: 'CHOOSE_METHOD', method: 'phone' })
    })
  }

  // Poll the pairing session while the QR is on screen. Same 2.5s mechanism the
  // queue workspace uses; stops as soon as the session leaves 'pending'.
  useEffect(() => {
    if (!qr || (state !== 'phone_waiting' && state !== 'phone_recording')) return
    let alive = true
    const id = setInterval(async () => {
      const res = await getDictationSessionStatus(qr.sessionId)
      if (!alive || res.error) return
      if (res.status === 'connected' || res.status === 'recording') {
        setState((s) => workspaceReducer(s, { type: 'PHONE_CONNECTED' }))
      }
      if (res.status === 'completed') {
        clearInterval(id)
        setState((s) => workspaceReducer(s, { type: 'AUDIO_RECEIVED' }))
        setQr(null)
      }
      if (res.status === 'expired' || res.status === 'cancelled') {
        clearInterval(id)
        setError(t('errors.qrExpired'))
        setState((s) => workspaceReducer(s, { type: 'FAIL' }))
      }
    }, 2500)
    return () => { alive = false; clearInterval(id) }
  }, [qr, state, t])

  function cancelPhone() {
    if (!qr) return
    const sessionId = qr.sessionId
    setQr(null)
    send({ type: 'RESET' })
    startTransition(async () => { await cancelDictationSession(sessionId) })
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setMethod('import')
    const fd = new FormData()
    fd.append('file', file)
    startTransition(async () => {
      const res = await importReportAudio(reportId, fd)
      if (res.error) { setError(res.error); send({ type: 'FAIL' }); return }
      send({ type: 'AUDIO_RECEIVED' })
    })
  }

  // ── Transcript → structuring ───────────────────────────────────────────────
  function saveTranscript() {
    setError(null)
    startTransition(async () => {
      const res = await saveReportTranscript(reportId, transcript)
      if (res.error) { setError(res.error); send({ type: 'FAIL' }); return }
      send({ type: 'TRANSCRIPT_READY' })
    })
  }

  function structure() {
    setError(null)
    send({ type: 'STRUCTURE' })
    startTransition(async () => {
      const res = await structureReportTranscript(reportId)
      if (res.error || !res.output) {
        setError(res.error ?? t('errors.structuringFailed'))
        send({ type: 'FAIL' })
        return
      }
      setDraft(res.output)
      setMeta(res.structuring ?? null)
      send({ type: 'STRUCTURED' })
    })
  }

  function applyDraft() {
    if (!draft) return
    onApply(draft)
  }

  const busy = isBusy(state) || isPending
  const committedText = canonicalTranscript(live)
  // Read straight from the recogniser: the guess is never mirrored into state.
  const interimGuess = speech.interimText.trim()
  const elapsedLabel = `${String(Math.floor(speech.elapsed / 60)).padStart(2, '0')}:${String(speech.elapsed % 60).padStart(2, '0')}`

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4"
      aria-labelledby="dictation-workspace-heading"
    >
      <h2 id="dictation-workspace-heading" className="text-sm font-semibold text-gray-900">
        {t('title')}
      </h2>

      {/* Screen readers are told what the workspace is doing. */}
      <p className="sr-only" role="status" aria-live="polite">
        {t(`state.${state}` as Parameters<typeof t>[0])}
      </p>

      {/* ── The one clinical question ── */}
      {(state === 'ready_to_dictate' || state === 'review_ready' || state === 'saved') && (
        <div className="mt-3">
          <p className="text-sm text-gray-600">{t('question')}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (m.key === 'computer') startComputer()
                  else if (m.key === 'phone') startPhone()
                  else fileRef.current?.click()
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                <span aria-hidden="true">{m.icon}</span>
                {t(`method.${m.key}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.mp4,.wav,.m4a"
            onChange={onFile}
            className="sr-only"
            aria-label={t('method.import')}
          />
        </div>
      )}

      {/* ── Recording ── */}
      {state === 'recording' && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-blue-800">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" aria-hidden="true" />
              {t('recording')} · {elapsedLabel}
            </span>
            <button
              type="button"
              onClick={stopComputer}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('stop')}
            </button>
          </div>
          {/* Settled speech reads as normal text; the live guess is muted and
              labelled, so the doctor can see it is still being heard. */}
          <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm">
            {committedText && <span className="text-gray-800">{committedText}</span>}
            {interimGuess && (
              <>
                {committedText ? ' ' : ''}
                <span className="text-gray-400 italic">{interimGuess}</span>
                <span className="ml-1 align-middle text-[10px] uppercase tracking-wide text-gray-400">
                  {t('inProgress')}
                </span>
              </>
            )}
            {!committedText && !interimGuess && (
              <span className="text-gray-400">{t('listening')}</span>
            )}
          </p>
          <p className="mt-1 text-[11px] text-blue-700">{t('interimNote')}</p>
        </div>
      )}

      {/* ── Phone pairing ── */}
      {(state === 'phone_waiting' || state === 'phone_recording') && qr && (
        <div className="mt-3 rounded-lg border border-gray-200 p-3">
          <p className="text-sm text-gray-700">{t('scanQr')}</p>
          <div
            className="mx-auto mt-2 w-[200px]"
            aria-label={t('scanQr')}
            /* Server-generated SVG from the qrcode package — no external service. */
            dangerouslySetInnerHTML={{ __html: qr.svg }}
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            {state === 'phone_recording' ? t('phoneRecording') : t('phoneWaiting')}
          </p>
          <div className="mt-2 flex justify-center">
            <button type="button" onClick={cancelPhone} className="text-xs text-gray-500 underline">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Transcript (kept distinct from the report) ── */}
      {(state === 'audio_uploaded' || state === 'transcribing' ||
        state === 'transcription_ready' || state === 'structuring' ||
        state === 'review_ready') && (
        <div className="mt-3">
          <label htmlFor="workspace-transcript" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('transcriptLabel')}
            {method && <span className="ml-2 font-normal normal-case text-gray-400">
              {t(`method.${method}` as Parameters<typeof t>[0])}
            </span>}
          </label>
          <textarea
            id="workspace-transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            disabled={busy}
            placeholder={t('transcriptPlaceholder')}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveTranscript}
              disabled={busy || !transcript.trim()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('saveTranscript')}
            </button>
            <button
              type="button"
              onClick={structure}
              disabled={busy || !canStructure(state)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {state === 'structuring' ? t('structuringInProgress') : t('structure')}
            </button>
          </div>
        </div>
      )}

      {/* ── Structured draft ready for the radiologist ── */}
      {state === 'review_ready' && draft && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-900">{t('draftReady')}</p>

          {meta?.reviewRequired && (
            <p className="mt-1 text-xs font-semibold text-amber-700">⚠ {t('reviewRequired')}</p>
          )}
          {meta?.confidence.some((c) => c.autoFilled) && (
            <p className="mt-0.5 text-[11px] text-amber-700">{t('autoFilled')}</p>
          )}
          {meta && meta.correctionEvents.length > 0 && (
            <p className="mt-0.5 text-[11px] text-gray-600">
              {t('corrections', { count: meta.correctionEvents.length })}
            </p>
          )}

          <button
            type="button"
            onClick={applyDraft}
            className="mt-2 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800"
          >
            {t('applyToReport')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}
