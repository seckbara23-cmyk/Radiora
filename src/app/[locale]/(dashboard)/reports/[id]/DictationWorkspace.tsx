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
  getActiveReportDictationSession,
  getDictationSessionStatus,
  cancelDictationSession,
} from '@/lib/actions/dictation'
import {
  phoneHandoffStage,
  workspaceEventForStatus,
  secondsRemaining,
  isLiveStage,
  type PhoneHandoffStage,
} from '@/lib/dictation/session-status'
import { PhoneHandoffPanel } from './PhoneHandoffPanel'
import {
  transcribeReportAudio,
  retryReportTranscription,
} from '@/lib/actions/transcription'
import {
  canRetryTranscription,
  type TranscriptionStage,
} from '@/lib/dictation/transcription-state'
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
  /**
   * R2.5 — the CANONICAL STABLE transcript, emitted as it grows so the report
   * can fill in while the doctor speaks. Committed segments only: the interim
   * guess never reaches this callback.
   */
  onStableTranscript?: (stable: string, opts?: { final?: boolean }) => void
}

const METHODS: { key: DictationMethod; icon: string }[] = [
  { key: 'computer', icon: '🎙' },
  { key: 'phone',    icon: '📱' },
  { key: 'import',   icon: '📁' },
]

export function DictationWorkspace({
  reportId,
  initialTranscript = '',
  onApply,
  onStableTranscript,
}: Props) {
  const t = useTranslations('workspace')
  const tLive = useTranslations('live')

  const [state, setState] = useState<WorkspaceState>(
    initialTranscript.trim() ? 'transcription_ready' : 'ready_to_dictate',
  )
  const [method, setMethod] = useState<DictationMethod | null>(null)
  const [transcript, setTranscript] = useState(initialTranscript)
  const [draft, setDraft] = useState<StructuredReportData | null>(null)
  const [meta, setMeta] = useState<HpdStructuringMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<{ svg: string; sessionId: string; expiresAt: string } | null>(null)
  // R2.7 — the handoff as the doctor reads it, kept separate from the workspace
  // state machine so no second state machine is introduced.
  const [stage, setStage] = useState<PhoneHandoffStage>('waiting')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [deviceLabel, setDeviceLabel] = useState<string | undefined>()
  const recoveredRef = useRef(false)
  // R2.7A — automatic speech-to-text for phone and imported audio.
  const [sttStage, setSttStage] = useState<TranscriptionStage>('none')
  const [sttError, setSttError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const send = (event: Parameters<typeof workspaceReducer>[1]) =>
    setState((s) => workspaceReducer(s, event))

  // R2.4 — settled speech is separated from the live guess. `live` holds only
  // COMMITTED segments; the interim guess stays in the recogniser hook, is
  // display-only, and can never reach a clinical section.
  const [live, setLive] = useState<TranscriptState>(emptyTranscriptState)
  // The reducer's accumulator. State is for rendering; this is what the next
  // commit reads, so the new canonical text can be emitted in the same event
  // instead of one render later.
  const liveRef = useRef<TranscriptState>(emptyTranscriptState())

  const onStableRef = useRef(onStableTranscript)
  useEffect(() => { onStableRef.current = onStableTranscript })

  // R2.7A — the poll fires transcription when the recording lands. Held in a
  // ref rather than declared as a dependency: the function is recreated every
  // render, so depending on it would tear down and restart the interval each
  // time and the handoff would never settle.
  const transcribeRef = useRef<(kind?: 'start' | 'retry') => void>(() => {})

  // Committing is an event (the recogniser settled more speech), not a
  // synchronisation, so it reduces here rather than in an effect.
  const speech = useSpeechRecognition({
    lang: 'fr-FR',
    onFinalText: (cumulative) => {
      const next = commitFinalized(liveRef.current, cumulative, {
        source: 'computer',
        now: new Date().toISOString(),
      })
      liveRef.current = next
      setLive(next)
      // R2.5 — only committed segments. `canonicalTranscript` excludes interim
      // by construction, so a live guess cannot reach the report.
      onStableRef.current?.(canonicalTranscript(next))
    },
  })

  // ── Workstation microphone ─────────────────────────────────────────────────
  function startComputer() {
    setError(null)
    setMethod('computer')
    if (!speech.supported) {
      setError(t('errors.unsupportedBrowser'))
      return
    }
    liveRef.current = emptyTranscriptState()
    setLive(liveRef.current)
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
        commitFinalized(liveRef.current, speech.finalText, {
          source: 'computer',
          now: new Date().toISOString(),
        }),
        speech.interimText,
      ),
      { source: 'computer', now: new Date().toISOString() },
    )
    liveRef.current = flushed
    setLive(flushed)

    const committed = canonicalTranscript(flushed)
    const text = [committed, pending].filter(Boolean).join(' ').trim()

    // The browser yields text, not audio: no audio asset is fabricated here.
    // The transcript itself is the record.
    if (!text) { send({ type: 'FAIL' }); setError(t('errors.noSpeech')); return }
    setTranscript(text)
    // R2.5 §17 — ONE final reconciliation over the complete canonical
    // transcript, including the pending clause the live passes never saw.
    onStableRef.current?.(text, { final: true })
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
    setStage('waiting')
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

  // R2.7 — recover a live phone session after a desktop reload. Re-minting
  // would invalidate the link the doctor's phone is already holding and could
  // lose a recording in progress, so the existing session is rediscovered by
  // report id instead. Runs once on mount; silent when there is nothing live.
  useEffect(() => {
    if (recoveredRef.current) return
    recoveredRef.current = true
    let alive = true
    void (async () => {
      const res = await getActiveReportDictationSession(reportId)
      if (!alive || res.error || !res.sessionId || !res.qrSvg) return
      setMethod('phone')
      setQr({ svg: res.qrSvg, sessionId: res.sessionId, expiresAt: res.expiresAt ?? '' })
      setStage(res.status ? phoneHandoffStage(res.status, res.expiresAt, Date.now()) : 'waiting')
      setState((s) => workspaceReducer(s, { type: 'CHOOSE_METHOD', method: 'phone' }))
    })()
    return () => { alive = false }
  }, [reportId])

  // Poll while the handoff can still change. `terminal` comes from the server,
  // which now resolves an expired TTL rather than reporting `pending` forever —
  // so this loop actually stops instead of polling a dead QR indefinitely.
  useEffect(() => {
    if (!qr || !isLiveStage(stage)) return
    let alive = true
    const id = setInterval(async () => {
      const res = await getDictationSessionStatus(qr.sessionId)
      if (!alive) return
      if (res.error || !res.status) return
      const next = phoneHandoffStage(res.status, res.expiresAt, Date.now())
      setStage(next)
      setDeviceLabel(res.deviceLabel)

      // The R2.3 reducer stays the only authority over workspace state; this
      // just hands it the event the session status implies.
      const event = workspaceEventForStatus(res.status, res.expiresAt, Date.now())
      if (event) setState((s) => workspaceReducer(s, event))

      if (res.terminal) {
        clearInterval(id)
        if (next === 'received') {
          setQr(null)
          // R2.7A — the phone is a microphone, so the words follow the
          // recording automatically. The doctor types nothing.
          transcribeRef.current()
        }
      }
    }, 2500)
    return () => { alive = false; clearInterval(id) }
  }, [qr, stage])

  // Countdown ticks locally; the authority on expiry is still the server.
  useEffect(() => {
    if (!qr?.expiresAt || !isLiveStage(stage)) return
    const tick = () => setSecondsLeft(secondsRemaining(qr.expiresAt, Date.now()))
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [qr, stage])

  /**
   * R2.7A — the recording is attached; turn it into text automatically.
   *
   * The doctor no longer types what they just dictated. The claim lives in the
   * database (migration 045), so calling this twice is safe: the second call
   * loses the claim and returns without spending a provider request.
   */
  function runTranscription(kind: 'start' | 'retry' = 'start') {
    setSttError(null)
    setSttStage('transcribing')
    startTransition(async () => {
      const res = kind === 'retry'
        ? await retryReportTranscription(reportId)
        : await transcribeReportAudio(reportId)

      if (res.code === 'already_processing') {
        setSttStage(res.stage ?? 'transcribing')
        return
      }
      if (res.error) {
        setSttStage(res.stage ?? 'failed')
        setSttError(res.error)
        return
      }
      setSttStage('completed')
      if (res.transcript) {
        setTranscript(res.transcript)
        // The transcript is complete, so it enters the SAME complete-transcript
        // path the workstation uses. No separate "mobile AI" anywhere.
        onStableRef.current?.(res.transcript, { final: true })
        send({ type: 'TRANSCRIPT_READY' })
      }
    })
  }

  useEffect(() => { transcribeRef.current = runTranscription })

  function cancelPhone() {
    if (!qr) return
    const sessionId = qr.sessionId
    setStage('cancelled')
    startTransition(async () => {
      await cancelDictationSession(sessionId)
      setQr(null)
      send({ type: 'RESET' })
    })
  }

  /** Expired or cancelled — mint a fresh link for the same report. */
  function restartPhone() {
    setQr(null)
    setError(null)
    startPhone()
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
      // R2.7A — imported audio enters the SAME transcription service and the
      // same canonical structuring path as a phone recording.
      runTranscription()
    })
  }

  // ── Transcript → structuring ───────────────────────────────────────────────
  function saveTranscript() {
    setError(null)
    startTransition(async () => {
      const res = await saveReportTranscript(reportId, transcript)
      if (res.error) { setError(res.error); send({ type: 'FAIL' }); return }
      send({ type: 'TRANSCRIPT_READY' })
      // R2.5 §18 — phone and imported audio arrive as ONE complete transcript.
      // They use the same coordinator, as a single complete revision; no live
      // streaming is fabricated for them.
      onStableRef.current?.(transcript.trim(), { final: true })
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

  // R2.7C(B) — corrections the engine held back rather than applied. Their text
  // is deliberately NOT in the clinical sections, so this is where it is seen.
  const unresolvedCorrections = (meta?.correctionEvents ?? []).filter((e) => e.applied === false)

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

      {/* ── Phone handoff (R2.7) ── */}
      {method === 'phone' && (qr || stage === 'expired' || stage === 'cancelled') && (
        <PhoneHandoffPanel
          stage={stage}
          qrSvg={qr?.svg ?? null}
          secondsLeft={secondsLeft}
          deviceLabel={deviceLabel}
          busy={busy}
          onCancel={cancelPhone}
          onRestart={restartPhone}
        />
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

          {/* R2.7A — automatic transcription. The doctor watches rather than
              types; the field below stays editable for corrections. */}
          {sttStage !== 'none' && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
              {sttStage === 'transcribing' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
                  <span
                    className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700 motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {t('stt.transcribing')}
                </span>
              )}
              {sttStage === 'completed' && (
                <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
                  {t('stt.ready')}
                </span>
              )}
              {sttStage === 'failed' && (
                <>
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                    {t('stt.failed')}
                  </span>
                  {canRetryTranscription(sttStage) && (
                    <button
                      type="button"
                      onClick={() => runTranscription('retry')}
                      disabled={busy}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    >
                      {t('stt.retry')}
                    </button>
                  )}
                </>
              )}
              {sttError && <span className="text-xs text-amber-700">{sttError}</span>}
            </div>
          )}
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

          {/* R2.7C(B) — a correction the engine refused to resolve no longer
              leaks into RÉSULTATS as "… 8 mm, je corrige 9 mm". The original
              finding stays in the section and the replacement is shown HERE, so
              the doctor can still see every word they dictated and decide. */}
          {unresolvedCorrections.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2">
              <p className="text-[11px] font-semibold text-amber-900">
                ⚠ {tLive('unresolvedCorrections')}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-amber-800">
                {tLive('unresolvedCorrectionsHint')}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {unresolvedCorrections.map((e, i) => (
                  <li key={i} className="text-[11px] leading-snug">
                    <span className="font-medium text-amber-900">{tLive('originalFinding')} : </span>
                    <span className="text-slate-700">{e.removed || '—'}</span>
                    <br />
                    <span className="font-medium text-amber-900">{tLive('proposedReplacement')} : </span>
                    <span className="text-slate-700">{e.kept || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
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
