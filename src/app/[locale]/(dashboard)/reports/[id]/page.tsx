import { Link } from '@/i18n/navigation'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReport } from '@/lib/data/reports'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getTemplates } from '@/lib/data/templates'
import { getReportVersions } from '@/lib/data/report-versions'
import { getUserPhrases } from '@/lib/data/preferences'
import {
  Badge,
  reportStatusVariant,
  studyPriorityVariant,
  studyStatusVariant,
} from '@/components/ui/badge'
import { ReportEditor } from './ReportEditor'
import { ReportExportActions } from './ReportExportActions'
import { VersionHistory } from './VersionHistory'
import { PatientExplanationPanel } from './PatientExplanationPanel'
import { ReportTranslationPanel } from './ReportTranslationPanel'
import { ExplanationTranslationPanel } from './ExplanationTranslationPanel'
import { getExplanationByReport } from '@/lib/data/explanations'
import { getTranslationByReport, getTranslationByExplanation } from '@/lib/data/translations'

type Props = { params: Promise<{ id: string; locale: string }> }

// French sex labels for the HPD document header.
const SEX_FR: Record<string, string> = {
  male:    'Masculin',
  female:  'Féminin',
  other:   'Autre',
  unknown: '',
}

function computeAge(dob: string | undefined): string {
  if (!dob) return ''
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 ? `${age} ans` : ''
}

export default async function ReportPage({ params }: Props) {
  const { id, locale } = await params
  setRequestLocale(locale)
  const user = await requireCurrentUser()

  const t   = await getTranslations('reports')
  const tSt = await getTranslations('statuses')

  const report = await getReport(id)
  if (!report) notFound()

  const [study, patient, versions] = await Promise.all([
    getStudy(report.studyId),
    getPatient(report.patientId),
    getReportVersions(id),
  ])

  const [templates, initialPhrases] = await Promise.all([
    getTemplates({ activeOnly: true, modality: study?.modality }),
    getUserPhrases({ examType: report.examType ?? undefined }),
  ])

  const canWrite  = ['super_admin', 'clinic_admin', 'radiologist'].includes(user.role)
  const canAmend  = ['super_admin', 'clinic_admin', 'radiologist'].includes(user.role)
  const canReview = ['super_admin', 'clinic_admin', 'radiologist'].includes(user.role)

  const isFinalized = report.status === 'finalized'

  const explanation = canReview && isFinalized
    ? await getExplanationByReport(id)
    : null

  const [reportTranslation, explanationTranslation] = await Promise.all([
    canReview && isFinalized
      ? getTranslationByReport(id)
      : Promise.resolve(null),
    canReview && explanation?.status === 'approved'
      ? getTranslationByExplanation(explanation.id)
      : Promise.resolve(null),
  ])

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/studies/${report.studyId}`}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            ← {study ? `${study.modality} — ${study.bodyPart}` : ''}
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold text-gray-900">{t('pageTitle')}</h1>
          {patient && (
            <p className="mt-0.5 text-sm text-gray-500">
              {patient.firstName} {patient.lastName}&nbsp;&middot;&nbsp;MRN {patient.mrn}
            </p>
          )}
        </div>
        <div className="mt-6 flex shrink-0 flex-col items-end gap-2">
          <Badge variant={reportStatusVariant[report.status]}>
            {tSt(`report.${report.status}` as Parameters<typeof tSt>[0])}
          </Badge>
          <ReportExportActions reportId={id} />
        </div>
      </div>

      {/* Study context bar */}
      {study && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm">
          <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {study.modality}
          </span>
          <span className="text-gray-700 font-medium">{study.bodyPart}</span>
          <span className="text-gray-400">{study.studyDate}</span>
          <Badge variant={studyPriorityVariant[study.priority]}>
            {tSt(`priority.${study.priority}` as Parameters<typeof tSt>[0])}
          </Badge>
          <Badge variant={studyStatusVariant[study.status]}>
            {tSt(`study.${study.status}` as Parameters<typeof tSt>[0])}
          </Badge>
          {study.description && (
            <span className="text-gray-500 hidden sm:inline truncate max-w-xs">{study.description}</span>
          )}
        </div>
      )}

      <ReportEditor
        report={report}
        canWrite={canWrite}
        canAmend={canAmend}
        templates={templates}
        modality={study?.modality ?? null}
        bodyPart={study?.bodyPart ?? null}
        initialPhrases={initialPhrases}
        patientInfo={{
          name: patient ? `${patient.lastName.toUpperCase()} ${patient.firstName}`.trim() : '',
          age:  computeAge(patient?.dateOfBirth),
          sex:  patient ? (SEX_FR[patient.sex] ?? '') : '',
        }}
        examDate={study?.studyDate ?? report.createdAt.slice(0, 10)}
      />

      <VersionHistory versions={versions} />

      {canReview && isFinalized && (
        <PatientExplanationPanel
          reportId={id}
          modality={study?.modality ?? null}
          bodyPart={study?.bodyPart ?? null}
          initialExplanation={explanation}
        />
      )}

      {canReview && isFinalized && (
        <ReportTranslationPanel
          reportId={id}
          sourceFindings={report.findings}
          sourceImpression={report.impression}
          sourceRecommendations={report.recommendations ?? ''}
          initialTranslation={reportTranslation}
        />
      )}

      {canReview && isFinalized && explanation?.status === 'approved' && (
        <ExplanationTranslationPanel
          explanationId={explanation.id}
          reportId={id}
          sourceExplanation={explanation.explanationText}
          sourceDisclaimer={explanation.disclaimer}
          initialTranslation={explanationTranslation}
        />
      )}

    </div>
  )
}
