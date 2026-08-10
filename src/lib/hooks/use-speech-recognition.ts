'use client'

// Phase 6B — thin React binding around the browser Web Speech API for live
// dictation. No persistence, no network: it only surfaces the live transcript
// and recording state. Cleanup/structuring is done by the pure live-dictation
// module; saving only happens on an explicit user action in the panel.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isSpeechRecognitionSupported } from '@/lib/ai/live-dictation'

export type DictationStatus = 'idle' | 'recording' | 'paused' | 'stopped'

interface UseSpeechRecognitionOptions {
  lang?: string
  onError?: (error: string) => void
  /**
   * R2.4 — fires when the recogniser settles more speech, with the CUMULATIVE
   * final text. Committing settled speech is an event, not a synchronisation,
   * so callers reduce here instead of mirroring transcript state in an effect.
   */
  onFinalText?: (cumulativeFinalText: string) => void
}

export interface SpeechRecognitionState {
  supported: boolean | null
  status: DictationStatus
  transcript: string // final + interim, live
  /** R2.4 — recogniser output split so the caller can tell settled speech from
   *  a live guess. `transcript` stays the merged view for existing consumers. */
  finalText: string
  interimText: string
  elapsed: number // seconds recorded
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
  /** Inject text without the mic (sample-dictation helper for pilot testing). */
  injectText: (text: string) => void
}

export function useSpeechRecognition({ lang = 'fr-FR', onError, onFinalText }: UseSpeechRecognitionOptions = {}): SpeechRecognitionState {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [finalText, setFinalText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [elapsed, setElapsed] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const finalRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Distinguish a user-initiated pause/stop from the API's own onend, so a pause
  // doesn't get treated as a stop (and we don't auto-restart after stop).
  const pausedRef = useRef(false)
  const stoppingRef = useRef(false)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onFinalTextRef = useRef(onFinalText)
  useEffect(() => { onFinalTextRef.current = onFinalText })

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported(typeof window !== 'undefined' ? window : null))
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }, [stopTimer])

  // Build a recognition instance wired to push live results into state.
  const build = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return null
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      let final = finalRef.current
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) final += (final ? ' ' : '') + res[0].transcript.trim()
        else interim += res[0].transcript
      }
      const settledMore = final !== finalRef.current
      finalRef.current = final
      setFinalText(final)
      setInterimText(interim)
      setTranscript(final + (interim ? (final ? ' ' : '') + interim : ''))
      // Only on genuinely new settled speech — an interim-only tick must not
      // re-run the caller's commit reducer.
      if (settledMore) onFinalTextRef.current?.(final)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      onErrorRef.current?.(String(event.error))
    }

    recognition.onend = () => {
      // The API stops on its own after silence. If the user is still recording
      // (not paused, not stopping), restart to keep a continuous session.
      if (pausedRef.current || stoppingRef.current) return
      try { recognition.start() } catch { /* already started */ }
    }

    return recognition
  }, [lang])

  const start = useCallback(() => {
    // Unsupported browsers never start — the panel shows the fallback message.
    if (!isSpeechRecognitionSupported(typeof window !== 'undefined' ? window : null)) return
    finalRef.current = ''
    setTranscript('')
    setFinalText('')
    setInterimText('')
    setElapsed(0)
    pausedRef.current = false
    stoppingRef.current = false
    const recognition = build()
    recognitionRef.current = recognition
    try { recognition?.start() } catch { /* noop */ }
    setStatus('recording')
    startTimer()
  }, [build, startTimer])

  const pause = useCallback(() => {
    pausedRef.current = true
    stopTimer()
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setStatus('paused')
  }, [stopTimer])

  const resume = useCallback(() => {
    pausedRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.start() } catch { /* noop */ }
    }
    setStatus('recording')
    startTimer()
  }, [startTimer])

  const stop = useCallback(() => {
    stoppingRef.current = true
    pausedRef.current = false
    stopTimer()
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setStatus('stopped')
  }, [stopTimer])

  const reset = useCallback(() => {
    stoppingRef.current = true
    try { recognitionRef.current?.abort() } catch { /* noop */ }
    recognitionRef.current = null
    stopTimer()
    finalRef.current = ''
    setTranscript('')
    setFinalText('')
    setInterimText('')
    setElapsed(0)
    setStatus('idle')
  }, [stopTimer])

  // Sample-dictation helper: stop any live capture and load fixed text so a
  // radiologist can try the flow without speaking. Never records, never saves.
  const injectText = useCallback((text: string) => {
    stoppingRef.current = true
    try { recognitionRef.current?.abort() } catch { /* noop */ }
    recognitionRef.current = null
    stopTimer()
    finalRef.current = text
    setTranscript(text)
    // Injected text is settled by definition — it is not a live guess.
    setFinalText(text)
    setInterimText('')
    setStatus('stopped')
  }, [stopTimer])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stoppingRef.current = true
      try { recognitionRef.current?.abort() } catch { /* noop */ }
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return { supported, status, transcript, finalText, interimText, elapsed, start, pause, resume, stop, reset, injectText }
}
