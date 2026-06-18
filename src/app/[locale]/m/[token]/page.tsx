import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getMobileContext } from '@/lib/data/dictation'
import { MobileRecorder } from './MobileRecorder'

export const metadata: Metadata = { robots: { index: false, follow: false } }

type Props = { params: Promise<{ token: string; locale: string }> }

export default async function MobileDictationPage({ params }: Props) {
  const { token, locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('m')

  const ctx = await getMobileContext(token)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">R</span>
        <span className="font-semibold text-gray-900">Radiora</span>
        <span className="ml-auto text-xs text-gray-400">{t('tagline')}</span>
      </div>

      {!ctx.valid ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            {ctx.reason === 'completed' ? t('alreadyDone') : t('linkInvalid')}
          </h1>
          <p className="max-w-xs text-sm text-gray-500">
            {ctx.reason === 'completed' ? t('alreadyDoneBody') : t('linkInvalidBody')}
          </p>
        </div>
      ) : (
        <>
          {/* Exam context (low-PHI only) */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t('dictatingFor')}</p>
            <p className="mt-1 font-semibold text-gray-900">{ctx.patientLabel || t('unidentified')}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {[ctx.modality, ctx.examNumber && `#${ctx.examNumber}`, ctx.vacationTitle].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="flex flex-1 flex-col justify-center pb-10">
            <MobileRecorder token={token} />
          </div>

          <p className="text-center text-xs text-gray-400">{t('privacyNote')}</p>
        </>
      )}
    </div>
  )
}
