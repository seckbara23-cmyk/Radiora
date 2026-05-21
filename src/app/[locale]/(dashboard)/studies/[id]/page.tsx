import { Link } from '@/i18n/navigation'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getReportByStudy } from '@/lib/data/reports'
import { createReport } from '@/lib/actions/reports'
import {
  Badge,
  studyStatusVariant,
  studyPriorityVariant,
  reportStatusVariant,
} from '@/components/ui/badge'
import { StudyStatusForm } from './StudyStatusForm'

type Props = { params: Promise<{ id: string; locale: string }> }

export default async function StudyDetailPage({ params }: Props) {
  const { id, locale } = await params
  setRequestLocale(locale)
  const user = await requireCurrentUser()

  const t    = await getTranslations('studies')
  const tP   = await getTranslations('patients')
  const tSt  = await getTranslations('statuses')

  const study = await getStudy(id)
  if (!study) notFound()

  const [patient, report] = await Promise.all([
    getPatient(study.patientId),
    getReportByStudy(id),
  ])

  const canCreateReport   = ['super_admin', 'clinic_admin', 'radiologist'].includes(user.role)
  const canUpdateStatus   = ['super_admin', 'clinic_admin', 'radiologist', 'technician'].includes(user.role)
  const canViewExternalAi = ['super_admin', 'clinic_admin', 'radiologist', 'technician'].includes(user.role)
  const createReportAction = createReport.bind(null, { error: null }) as unknown as (formData: FormData) => Promise<void>

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/studies" className="text-sm text-gray-500 hover:text-gray-700 transition">
            {t('back')}
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold text-gray-900">
            {study.modality} — {study.bodyPart}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-gray-400">{study.accessionNumber}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-6">
          <Badge variant={studyPriorityVariant[study.priority]}>
            {tSt(`priority.${study.priority}` as Parameters<typeof tSt>[0])}
          </Badge>
          <Badge variant={studyStatusVariant[study.status]}>
            {tSt(`study.${study.status}` as Parameters<typeof tSt>[0])}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Left: study details + patient */}
        <div className="lg:col-span-2 space-y-6">

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('studyDetails')}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-gray-500">{t('modality')}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{study.modality ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">{t('bodyPart')}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{study.bodyPart ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">{t('studyDate')}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{study.studyDate ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">{t('priority')}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">
                  {study.priority.charAt(0).toUpperCase() + study.priority.slice(1)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">{t('referringPhysician')}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{study.referringPhysician || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">{t('accessionNumber')}</dt>
                <dd className="mt-0.5 text-sm text-gray-900 font-mono text-xs">{study.accessionNumber ?? '—'}</dd>
              </div>
            </dl>
            {study.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <dt className="text-xs font-medium text-gray-500">{t('indication')}</dt>
                <dd className="mt-1 text-sm text-gray-900">{study.description}</dd>
              </div>
            )}
          </div>

          {patient && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">{t('patient')}</h2>
                <Link href={`/patients/${patient.id}`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  {t('viewRecord')}
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500">{t('name')}</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">{patient.firstName} {patient.lastName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">{tP('mrn')}</dt>
                  <dd className="mt-0.5 text-sm text-gray-900 font-mono text-xs">{patient.mrn}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">{tP('dateOfBirth')}</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">{patient.dateOfBirth}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">{tP('sex')}</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">
                    {patient.sex === 'male' ? tP('male') : patient.sex === 'female' ? tP('female') : tP('other')}
                  </dd>
                </div>
              </dl>
            </div>
          )}

        </div>

        {/* Right: report + status update */}
        <div className="space-y-6">

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('reportSection')}</h2>
            {report ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={reportStatusVariant[report.status]}>
                    {tSt(`report.${report.status}` as Parameters<typeof tSt>[0])}
                  </Badge>
                  {report.signedAt && (
                    <span className="text-xs text-gray-400">
                      {t('signed')} {report.signedAt.slice(0, 10)}
                    </span>
                  )}
                </div>
                <Link href={`/reports/${report.id}`}
                  className="block w-full text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                  {report.status === 'finalized' || report.status === 'amended'
                    ? t('viewReport')
                    : t('editReport')}
                </Link>
              </div>
            ) : canCreateReport ? (
              <form action={createReportAction} className="space-y-3">
                <input type="hidden" name="study_id"   value={study.id} />
                <input type="hidden" name="patient_id" value={study.patientId} />
                <p className="text-sm text-gray-500">{t('noReport')}</p>
                <button type="submit"
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
                  {t('createReport')}
                </button>
              </form>
            ) : (
              <p className="text-sm text-gray-500">{t('noReport')}</p>
            )}
          </div>

          {canViewExternalAi && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">{t('externalAi')}</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">{t('externalAiDesc')}</p>
              <Link
                href={`/studies/${study.id}/external-ai`}
                className="block w-full text-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition"
              >
                {t('externalAiResults')}
              </Link>
            </div>
          )}

          {canUpdateStatus && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('updateStatus')}</h2>
              <StudyStatusForm studyId={study.id} currentStatus={study.status} />
            </div>
          )}

        </div>

      </div>

    </div>
  )
}
