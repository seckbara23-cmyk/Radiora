'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { uploadAudio } from '@/lib/actions/audio'

export function AudioUploader({
  vacationItemId,
  vacationId,
}: {
  vacationItemId: string
  vacationId?:    string
}) {
  const t = useTranslations('audio')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [pending, start]        = useTransition()

  function submit() {
    const file = inputRef.current?.files?.[0]
    if (!file) { setError(t('chooseFile')); return }
    setError(null)
    const fd = new FormData()
    fd.set('file', file)
    fd.set('mode', 'single')
    fd.set('vacationItemId', vacationItemId)
    if (vacationId) fd.set('vacationId', vacationId)
    start(async () => {
      const res = await uploadAudio(fd)
      if (res.error) { setError(res.error); return }
      setFileName('')
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3 3 3m-3-3v6" />
          </svg>
          {fileName || t('chooseFile')}
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.mp4,.wav,.m4a,audio/*"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </label>
        <button
          onClick={submit}
          disabled={pending || !fileName}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
        >
          {pending ? t('uploading') : t('upload')}
        </button>
      </div>
      <p className="text-xs text-gray-400">{t('formatsHint')}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
