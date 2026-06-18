'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { saveTranscription, routeToRadiologist } from '@/lib/actions/audio'
import {
  findMedicalCorrections,
  applyCorrection,
  applyAllCorrections,
  type DetectedCorrection,
} from '@/lib/ai/voice-corrections'

export function TranscriptionEditor({
  itemId,
  vacationId,
  initialText,
  canRoute,
  currentStatus,
}: {
  itemId:        string
  vacationId:    string
  initialText:   string
  canRoute:      boolean
  currentStatus: string
}) {
  const t = useTranslations('audio')
  const router = useRouter()

  const [text, setText]       = useState(initialText)
  const [saved, setSaved]     = useState(initialText)
  const [error, setError]     = useState<string | null>(null)
  const [savePending, startSave]   = useTransition()
  const [routePending, startRoute] = useTransition()

  const dirty = text !== saved
  const corrections = useMemo<DetectedCorrection[]>(() => findMedicalCorrections(text), [text])

  function save() {
    setError(null)
    startSave(async () => {
      const res = await saveTranscription({ itemId, correctedText: text })
      if (res.error) { setError(res.error); return }
      setSaved(text)
      router.refresh()
    })
  }

  function acceptOne(c: DetectedCorrection) {
    setText((prev) => applyCorrection(prev, c))
  }

  function acceptAll() {
    setText((prev) => applyAllCorrections(prev, findMedicalCorrections(prev)))
  }

  function route() {
    setError(null)
    startRoute(async () => {
      // Persist the latest edit before handing off.
      if (dirty) {
        const r = await saveTranscription({ itemId, correctedText: text })
        if (r.error) { setError(r.error); return }
        setSaved(text)
      }
      const res = await routeToRadiologist({ itemId })
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  const alreadyRouted = currentStatus === 'radiologist_review'

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700">{t('transcript')}</label>
          <span className="text-xs text-gray-400">{text.trim() ? t('charCount', { count: text.length }) : t('emptyTranscript')}</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder={t('transcriptPlaceholder')}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-mono"
        />
      </div>

      {/* Terminology suggestions (phrasing only — never diagnostic content) */}
      {corrections.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-amber-800">{t('suggestions', { count: corrections.length })}</p>
            <button onClick={acceptAll} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline">
              {t('acceptAll')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {corrections.map((c, idx) => (
              <button
                key={`${c.startIndex}-${idx}`}
                onClick={() => acceptOne(c)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-amber-100 transition"
                title={t('replaceWith', { term: c.replacement })}
              >
                <span className="line-through text-gray-400">{c.original}</span>
                <span aria-hidden>→</span>
                <span className="font-medium text-amber-800">{c.replacement}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={savePending || !dirty}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition disabled:opacity-50"
        >
          {savePending ? t('saving') : dirty ? t('save') : t('saved')}
        </button>

        {canRoute && !alreadyRouted && (
          <button
            onClick={route}
            disabled={routePending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            {routePending ? t('routing') : t('routeToRadiologist')}
          </button>
        )}
        {alreadyRouted && (
          <span className="text-xs font-medium text-green-700">{t('routedAlready')}</span>
        )}
      </div>

      {/* Medical-safety reminder */}
      <p className="text-xs text-gray-400">{t('safetyNote')}</p>
    </div>
  )
}
