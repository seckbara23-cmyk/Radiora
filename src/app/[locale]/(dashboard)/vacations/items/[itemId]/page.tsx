import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getQueueItem } from '@/lib/data/vacations'
import {
  getAudioAsset,
  getTranscription,
  createSignedAudioUrl,
  getClinicPatients,
} from '@/lib/data/audio'
import { Badge, vacationWorkflowVariant } from '@/components/ui/badge'
import { AudioUploader } from './AudioUploader'
import { TranscriptionEditor } from './TranscriptionEditor'
import { PatientMatchControl } from './PatientMatchControl'
import type { UserRole } from '@/types/user'

const VIEW_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin']
const MANAGE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']

type Props = { params: Promise<{ itemId: string; locale: string }> }

export default async function ItemWorkspacePage({ params }: Props) {
  const { itemId, locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  if (!VIEW_ROLES.includes(user.role)) redirect(`/${locale}/dashboard`)

  const t = await getTranslations('audio')
  const tq = await getTranslations('vacationQueue')

  const item = await getQueueItem(itemId)
  if (!item) notFound()

  const canManage = MANAGE_ROLES.includes(user.role)

  const [asset, transcription, patients] = await Promise.all([
    item.audioAssetId ? getAudioAsset(item.audioAssetId) : Promise.resolve(null),
    getTranscription(itemId),
    canManage ? getClinicPatients() : Promise.resolve([]),
  ])

  const audioUrl = asset ? await createSignedAudioUrl(asset.storagePath) : null
  const transcriptText = transcription?.correctedText || transcription?.rawText || ''

  const patientDisplay = item.patientName ?? item.patientLabel ?? tq('unmatched')

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Link href={`/vacations/${item.vacationId}`} className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← {item.vacationTitle || tq('title')}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{patientDisplay}</h1>
          <Badge variant={vacationWorkflowVariant[item.workflowStatus]}>
            {tq(`status.${item.workflowStatus}` as Parameters<typeof tq>[0])}
          </Badge>
          {item.examNumber && <span className="font-mono text-xs text-gray-500">#{item.examNumber}</span>}
        </div>
      </div>

      {/* Patient match */}
      {canManage && (
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('matchPatient')}</h2>
          <p className="text-xs text-gray-500 mb-3">{t('matchPatientHint')}</p>
          <div className="max-w-md">
            <PatientMatchControl itemId={item.id} patients={patients} currentPatientId={item.patientId} />
          </div>
        </section>
      )}

      {/* Audio */}
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('dictationAudio')}</h2>
        {audioUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls preload="metadata" src={audioUrl} className="w-full">
              {t('audioUnsupported')}
            </audio>
            {asset && (
              <p className="text-xs text-gray-400">
                {asset.originalFilename} · {(asset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>
        ) : canManage ? (
          <AudioUploader vacationItemId={item.id} vacationId={item.vacationId} />
        ) : (
          <p className="text-sm text-gray-400">{t('noAudioYet')}</p>
        )}
      </section>

      {/* Transcription */}
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('transcription')}</h2>
        {canManage ? (
          <TranscriptionEditor
            itemId={item.id}
            vacationId={item.vacationId}
            initialText={transcriptText}
            canRoute={canManage}
            currentStatus={item.workflowStatus}
          />
        ) : transcriptText ? (
          <p className="whitespace-pre-wrap text-sm text-gray-700">{transcriptText}</p>
        ) : (
          <p className="text-sm text-gray-400">{t('noTranscriptYet')}</p>
        )}
      </section>

      {/* Report link */}
      {item.reportId && (
        <Link
          href={`/reports/${item.reportId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {tq('openReport')} →
        </Link>
      )}
    </div>
  )
}
