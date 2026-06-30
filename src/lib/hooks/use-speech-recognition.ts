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
}

export interface SpeechRecognitionState {
  supported: boolean | null
  status: DictationStatus
  transcript: string // final + interim, live
  elapsed: number // seconds recorded
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechRecognition({ lang = 'fr-FR', onError }: UseSpeechRecognitionOptions = {}): SpeechRecognitionState {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [transcript, setTranscript] = useState('')
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
      finalRef.current = final
      setTranscript(final + (interim ? (final ? ' ' : '') + interim : ''))
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
    setElapsed(0)
    setStatus('idle')
  }, [stopTimer])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stoppingRef.current = true
      try { recognitionRef.current?.abort() } catch { /* noop */ }
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return { supported, status, transcript, elapsed, start, pause, resume, stop, reset }
}
