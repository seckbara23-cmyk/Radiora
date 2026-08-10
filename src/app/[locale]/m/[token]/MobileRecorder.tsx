'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { markDeviceConnected, markDeviceRecording, uploadFromMobile } from '@/lib/actions/dictation'

type Phase = 'idle' | 'recording' | 'review' | 'sending' | 'done' | 'error'
type Mode = 'tap' | 'ptt'

/** Pick a container the browser can actually record AND our bucket accepts. */
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c } catch { /* ignore */ }
  }
  return ''
}

function extForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Mobile'
  const ua = navigator.userAgent
  const platform =
    /iphone|ipad|ipod/i.test(ua) ? 'iOS' :
    /android/i.test(ua) ? 'Android' :
    /mac/i.test(ua) ? 'Mac' :
    /windows/i.test(ua) ? 'Windows' : 'Mobile'
  const browser =
    /crios|chrome/i.test(ua) ? 'Chrome' :
    /fxios|firefox/i.test(ua) ? 'Firefox' :
    /safari/i.test(ua) ? 'Safari' : 'Browser'
  return `${platform} · ${browser}`
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function MobileRecorder({ token }: { token: string }) {
  const t = useTranslations('m')

  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<Mode>('tap')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [battery, setBattery] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const blobRef = useRef<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const mimeRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sendingRef = useRef(false)

  // Announce the phone connected, and report battery if the API exists.
  useEffect(() => {
    void markDeviceConnected(token, deviceLabel())
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }
    nav.getBattery?.().then((b) => setBattery(Math.round(b.level * 100))).catch(() => {})
  }, [token])

  const cleanupStream = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    setLevel(0)
  }, [])

  useEffect(() => () => {
    cleanupStream()
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }, [cleanupStream, blobUrl])

  const startRecording = useCallback(async () => {
    setError(null)
    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null) }
    blobRef.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const mime = pickMime()
      mimeRef.current = mime
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const type = mimeRef.current || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        blobRef.current = blob
        setBlobUrl(URL.createObjectURL(blob))
        setPhase('review')
        cleanupStream()
      }
      recorder.start()
      setPhase('recording')
      // R2.7 — the desktop can now say "Recording on phone" instead of guessing
      // from "connected". Carries no content, only that capture began.
      void markDeviceRecording(token)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)

      // Lightweight input-level meter.
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        audioCtxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128))
          setLevel(Math.min(1, peak / 90))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch { /* meter is optional */ }
    } catch {
      setError(t('micDenied'))
      setPhase('error')
      cleanupStream()
    }
  }, [blobUrl, cleanupStream, t, token])

  const stopRecording = useCallback(() => {
    const r = recorderRef.current
    if (r && r.state !== 'inactive') r.stop()
  }, [])

  async function send() {
    const blob = blobRef.current
    if (!blob || blob.size === 0) { setError(t('nothingRecorded')); return }
    // R2.7 — a second tap while the first is in flight must not start a second
    // upload. The server claims the session atomically as well, so a duplicate
    // that slips past this is still rejected rather than stored twice.
    if (sendingRef.current) return
    sendingRef.current = true

    setPhase('sending')
    setError(null)
    try {
      const ext = extForMime(mimeRef.current)
      const fd = new FormData()
      fd.set('file', new File([blob], `dictation.${ext}`, { type: blob.type || `audio/${ext}` }))
      fd.set('deviceLabel', deviceLabel())
      const res = await uploadFromMobile(token, fd)
      if (res.error) {
        // The recording is still in memory: the doctor can retry without
        // re-dictating, and the session is not consumed until an upload wins.
        setError(res.error)
        setPhase('review')
        return
      }
      if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null) }
      setPhase('done')
    } catch {
      setError(t('sendFailed'))
      setPhase('review')
    } finally {
      sendingRef.current = false
    }
  }

  function reset() {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null) }
    blobRef.current = null
    setSeconds(0)
    setPhase('idle')
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{t('sentTitle')}</h2>
        <p className="max-w-xs text-sm text-gray-500">{t('sentBody')}</p>
      </div>
    )
  }

  const recording = phase === 'recording'

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Status / battery */}
      <div className="flex w-full items-center justify-between text-xs text-gray-400">
        <span>{deviceLabel()}</span>
        {battery !== null && <span>{t('battery', { pct: battery })}</span>}
      </div>

      {/* Timer + level */}
      <div className="flex flex-col items-center gap-3">
        <div className={`font-mono text-4xl tabular-nums ${recording ? 'text-red-600' : 'text-gray-800'}`}>
          {mmss(seconds)}
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-red-500 transition-[width] duration-75"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>

      {/* Mode toggle (only when idle) */}
      {phase === 'idle' && (
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
          <button
            onClick={() => setMode('tap')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === 'tap' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
          >
            {t('modeTap')}
          </button>
          <button
            onClick={() => setMode('ptt')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === 'ptt' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
          >
            {t('modePtt')}
          </button>
        </div>
      )}

      {/* Primary control */}
      {phase !== 'review' && phase !== 'sending' && (
        mode === 'ptt' ? (
          <button
            onPointerDown={(e) => { e.preventDefault(); if (!recording) void startRecording() }}
            onPointerUp={(e) => { e.preventDefault(); if (recording) stopRecording() }}
            onPointerLeave={() => { if (recording) stopRecording() }}
            className={`flex h-28 w-28 select-none touch-none items-center justify-center rounded-full text-sm font-semibold text-white shadow-lg transition ${recording ? 'scale-105 bg-red-600' : 'bg-blue-600'}`}
          >
            {recording ? t('release') : t('holdToTalk')}
          </button>
        ) : (
          <button
            onClick={() => (recording ? stopRecording() : void startRecording())}
            className={`flex h-28 w-28 items-center justify-center rounded-full text-white shadow-lg transition ${recording ? 'bg-red-600' : 'bg-blue-600'}`}
          >
            {recording ? (
              <span className="h-7 w-7 rounded-sm bg-white" />
            ) : (
              <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3z" />
                <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V21a1 1 0 102 0v-3.08A7 7 0 0019 11z" />
              </svg>
            )}
          </button>
        )
      )}

      {phase === 'idle' && <p className="text-sm text-gray-500">{mode === 'ptt' ? t('holdHint') : t('tapHint')}</p>}
      {recording && <p className="text-sm font-medium text-red-600">{t('recordingNow')}</p>}

      {/* One live region for the whole recorder, so the phase is announced. */}
      <p className="sr-only" role="status" aria-live="polite">
        {t(`phase.${phase}` as Parameters<typeof t>[0])}
      </p>

      {/* Review */}
      {phase === 'review' && blobUrl && (
        <div className="flex w-full flex-col items-center gap-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={blobUrl} className="w-full" />
          <div className="flex w-full gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700"
            >
              {t('redo')}
            </button>
            <button
              onClick={send}
              className="flex-[2] rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {error ? t('retrySend') : t('send')}
            </button>
          </div>
        </div>
      )}

      {phase === 'sending' && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          {t('sending')}
        </p>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
