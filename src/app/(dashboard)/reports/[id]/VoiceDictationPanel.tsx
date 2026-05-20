'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createVoiceTranscript, reviewVoiceTranscript, rejectVoiceTranscript, applyVoiceTranscript } from '@/lib/actions/voice'
import type { VoiceTranscript } from '@/lib/data/voice-transcripts'

interface Props {
  reportId:      string
  onApply:       (text: string) => void  // sends transcript text to Smart Structuring
}

type Phase = 'idle' | 'recording' | 'review' | 'saved'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function VoiceDictationPanel({ reportId, onApply }: Props) {
  const [open, setOpen]       = useState(false)
  const [phase, setPhase]     = useState<Phase>('idle')
  const [supported, setSupported] = useState<boolean | null>(null) // null = not yet checked

  // Recording state
  const [liveText,    setLiveText]    = useState('')
  const [elapsed,     setElapsed]     = useState(0)
  const [isPending,   startTransition] = useTransition()

  // Review state
  const [editText,    setEditText]    = useState('')
  const [error,       setError]       = useState<string | null>(null)

  // Saved state
  const [savedTranscript, setSavedTranscript] = useState<VoiceTranscript | null>(null)
  const [showRejectForm,  setShowRejectForm]  = useState(false)
  const [rejectReason,    setRejectReason]    = useState('')

  // Refs to avoid closure problems in SpeechRecognition callbacks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null)
  const finalTextRef    = useRef('')
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)

  // Detect SpeechRecognition support once panel is opened
  useEffect(() => {
    if (open && supported === null) {
      const hasAPI = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window)
      setSupported(hasAPI)
    }
  }, [open, supported])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function startTimer() {
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function startRecording() {
    finalTextRef.current = ''
    setLiveText('')
    setError(null)
    setPhase('recording')
    startTimer()

    if (!supported) {
      // Fallback: user types manually — no SpeechRecognition
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    const recognition = new SR()
    recognition.continuous       = true
    recognition.interimResults   = true
    recognition.lang             = 'en-US'
    recognitionRef.current       = recognition

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      let final   = finalTextRef.current

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += (final ? ' ' : '') + result[0].transcript.trim()
        } else {
          interim += result[0].transcript
        }
      }

      finalTextRef.current = final
      setLiveText(final + (interim ? (final ? ' ' : '') + interim : ''))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return // benign
      setError(`Microphone error: ${event.error}. You can still type your notes below.`)
    }

    recognition.onend = () => {
      // onend fires after stop() — move to review with whatever was captured
      stopTimer()
      const captured = finalTextRef.current.trim()
      setEditText(captured)
      setPhase('review')
    }

    recognition.start()
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop() // triggers onend → moves to review
    } else {
      // Fallback (no SpeechRecognition): user typed into liveText textarea
      stopTimer()
      setEditText(liveText.trim())
      setPhase('review')
    }
  }

  function handleDiscard() {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    stopTimer()
    finalTextRef.current = ''
    setLiveText('')
    setEditText('')
    setError(null)
    setPhase('idle')
  }

  function handleSave() {
    const text = editText.trim()
    if (!text) return

    startTransition(async () => {
      setError(null)
      const result = await createVoiceTranscript(
        reportId,
        text,
        supported ? 'browser_speech_api' : 'mock_local',
        elapsed || null,
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedTranscript(result.transcript!)
      setPhase('saved')
    })
  }

  function handleSaveAndApply() {
    const text = editText.trim()
    if (!text) return

    startTransition(async () => {
      setError(null)
      const result = await createVoiceTranscript(
        reportId,
        text,
        supported ? 'browser_speech_api' : 'mock_local',
        elapsed || null,
      )
      if (result.error) {
        setError(result.error)
        return
      }
      const transcript = result.transcript!
      setSavedTranscript(transcript)
      setPhase('saved')

      // Fire audit for apply, then push text to Smart Structuring
      await applyVoiceTranscript(transcript.id, reportId)
      onApply(text)
    })
  }

  function handleApplyFromSaved() {
    if (!savedTranscript) return
    startTransition(async () => {
      setError(null)
      await applyVoiceTranscript(savedTranscript.id, reportId)
      onApply(savedTranscript.transcriptText)
    })
  }

  function handleMarkReviewed() {
    if (!savedTranscript) return
    startTransition(async () => {
      setError(null)
      const result = await reviewVoiceTranscript(savedTranscript.id, reportId)
      if (result.error) setError(result.error)
      else setSavedTranscript(result.transcript!)
    })
  }

  function handleConfirmReject() {
    if (!savedTranscript || !rejectReason.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await rejectVoiceTranscript(savedTranscript.id, reportId, rejectReason)
      if (result.error) {
        setError(result.error)
        return
      }
      // Transcript rejected — reset to idle for a new recording
      setSavedTranscript(null)
      setShowRejectForm(false)
      setRejectReason('')
      setEditText('')
      setPhase('idle')
    })
  }

  function handleStartNew() {
    setSavedTranscript(null)
    setShowRejectForm(false)
    setRejectReason('')
    setEditText('')
    setLiveText('')
    setError(null)
    setPhase('idle')
  }

  const spinnerSvg = (
    <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/30 overflow-hidden">

      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-cyan-50/60 transition"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-cyan-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"
            />
          </svg>
          <span className="text-sm font-semibold text-cyan-900">Voice Dictation</span>
          <span className="text-xs text-cyan-600 bg-cyan-100 rounded-full px-2 py-0.5 font-medium">
            Browser
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-cyan-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-cyan-200 px-5 py-4 space-y-4">

          {/* Warning */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <span className="font-semibold">Clinician review required.</span> Voice transcripts must be
            reviewed and edited before clinical use. Transcripts are forwarded to Smart Structuring for
            structuring — never applied to the report automatically.
          </div>

          {/* ── IDLE ─────────────────────────────────────────────────────── */}
          {phase === 'idle' && (
            <div className="space-y-3">
              {supported === false && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Your browser does not support the Web Speech API. You can type your dictation notes manually below.
                </p>
              )}
              <button
                type="button"
                onClick={startRecording}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white text-sm font-semibold rounded-lg transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" />
                </svg>
                {supported === false ? 'Enter Notes Manually' : 'Start Recording'}
              </button>
            </div>
          )}

          {/* ── RECORDING ────────────────────────────────────────────────── */}
          {phase === 'recording' && (
            <div className="space-y-4">
              {/* Timer + pulsing indicator */}
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="text-sm font-mono font-medium text-gray-700">
                  {formatDuration(elapsed)}
                </span>
                <span className="text-xs text-gray-400">
                  {supported ? 'Listening…' : 'Type your dictation below'}
                </span>
              </div>

              {/* Live transcript or manual textarea */}
              {supported ? (
                <div className="rounded-lg border border-cyan-200 bg-white px-3 py-2.5 text-sm text-gray-700 min-h-[6rem] whitespace-pre-wrap">
                  {liveText || <span className="text-gray-400 italic">Speak now…</span>}
                </div>
              ) : (
                <textarea
                  rows={6}
                  value={liveText}
                  onChange={(e) => setLiveText(e.target.value)}
                  placeholder="Type your dictation here…"
                  className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-y"
                />
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  {supported ? 'Stop Recording' : 'Done Typing'}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* ── REVIEW ───────────────────────────────────────────────────── */}
          {phase === 'review' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1.5">
                  Review and edit the transcript before saving
                </p>
                <textarea
                  rows={6}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:bg-gray-50 resize-y"
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAndApply}
                  disabled={!editText.trim() || isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white text-sm font-semibold rounded-lg transition"
                >
                  {isPending ? <>{spinnerSvg} Saving…</> : 'Save & Send to Smart Structuring'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!editText.trim() || isPending}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition"
                >
                  Save Only
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isPending}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* ── SAVED ────────────────────────────────────────────────────── */}
          {phase === 'saved' && savedTranscript && (
            <div className="space-y-4">
              <div className="rounded-lg border border-cyan-200 bg-white px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap">
                {savedTranscript.transcriptText}
              </div>

              {savedTranscript.transcriptStatus === 'reviewed' && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-1.5">
                  Marked as reviewed.
                </p>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              {!showRejectForm && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyFromSaved}
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white text-sm font-semibold rounded-lg transition"
                  >
                    {isPending ? <>{spinnerSvg} Sending…</> : 'Send to Smart Structuring'}
                  </button>
                  {savedTranscript.transcriptStatus !== 'reviewed' && (
                    <button
                      type="button"
                      onClick={handleMarkReviewed}
                      disabled={isPending}
                      className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition"
                    >
                      Mark as Reviewed
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isPending}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg transition"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={handleStartNew}
                    disabled={isPending}
                    className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
                  >
                    Start New Recording
                  </button>
                </div>
              )}

              {showRejectForm && (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-900">Reason for rejection *</p>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    disabled={isPending}
                    placeholder="e.g. Transcript is inaccurate — will re-record."
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmReject}
                      disabled={!rejectReason.trim() || isPending}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition"
                    >
                      {isPending ? 'Rejecting…' : 'Confirm Rejection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowRejectForm(false); setRejectReason('') }}
                      disabled={isPending}
                      className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
