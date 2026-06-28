'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CreateVacationForm } from './CreateVacationForm'
import type { ClinicRadiologist } from '@/types/vacation'

// Presentation Screen 4 — the two large entry points the radiologist sees first:
//   Option 1 · Dictée en direct (phone QR)   Option 2 · Importer un fichier audio
//
// Both require a vacation session before the per-patient QR pairing / audio upload
// (which live, unchanged, on the item page). So each option opens the EXISTING
// CreateVacationForm — no new QR or upload logic is introduced here.
export function DictationOptions({ radiologists }: { radiologists: ClinicRadiologist[] }) {
  const t = useTranslations('vacationQueue')
  const [open, setOpen] = useState(false)

  return (
    <section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Option 1 — Dictée en direct (QR) */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z" />
              </svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Option 1</p>
              <h3 className="text-lg font-semibold text-gray-900">{t('optionLiveTitle')}</h3>
            </div>
          </div>

          {/* QR placeholder — the real, per-patient QR is shown on the item page */}
          <div className="mt-5 flex justify-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-300">
              <svg className="h-14 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
                  d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 3h3m-3 3h6m0-6v3" />
              </svg>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-gray-600">{t('optionLiveDesc')}</p>

          <button
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('optionLiveCta')}
          </button>

          <ul className="mt-4 space-y-1.5 text-sm text-gray-500">
            {[t('optionLiveAndroid'), t('optionLiveIphone'), t('optionLiveNoApp')].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Option 2 — Importer un fichier audio */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 11a7 7 0 01-14 0m7 7v3m0-3a4 4 0 01-4-4V7a4 4 0 118 0v4a4 4 0 01-4 4z" />
              </svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Option 2</p>
              <h3 className="text-lg font-semibold text-gray-900">{t('optionUploadTitle')}</h3>
            </div>
          </div>

          {/* Upload affordance — the real uploader is on the item page */}
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-7 text-center">
            <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4}
                d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3 3 3m-3-3v6" />
            </svg>
            <p className="mt-2 text-xs font-medium text-gray-400">{t('optionUploadFormats')}</p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-gray-600">{t('optionUploadDesc')}</p>

          <button
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('optionUploadCta')}
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">{t('optionsHint')}</p>

      {/* Reused, unchanged session creator — opened by either option. */}
      {open && (
        <div className="mt-4">
          <CreateVacationForm radiologists={radiologists} open={open} onOpenChange={setOpen} hideTrigger />
        </div>
      )}
    </section>
  )
}
