import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReport } from '@/lib/data/reports'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getTemplates } from '@/lib/data/templates'
import { getReportVersions } from '@/lib/data/report-versions'
import {
  Badge,
  reportStatusVariant,
  studyPriorityVariant,
  studyStatusLabel,
  studyStatusVariant,
} from '@/components/ui/badge'
import { ReportEditor } from './ReportEditor'
import { VersionHistory } from './VersionHistory'
import { PatientExplanationPanel } from './PatientExplanationPanel'
import { ReportTranslationPanel } from './ReportTranslationPanel'
import { ExplanationTranslationPanel } from './ExplanationTranslationPanel'
import { getExplanationByReport } from '@/lib/data/explanations'
import { getTranslationByReport, getTranslationByExplanation } from '@/lib/data/translations'

type Props = { params: Promise<{ id: string }> }

export default async function ReportPage({ params }: Props) {
  const { id } = await params
  const user   = await requireCurrentUser()

  const report = await getReport(id)
  if (!report) notFound()

  const [study, patient, versions] = await Promise.all([
    getStudy(report.studyId),
    getPatient(report.patientId),
    getReportVersions(id),
  ])

  // Fetch templates filtered to the study's modality (+ generic templates)
  const templates = await getTemplates({ activeOnly: true, modality: study?.modality })

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
            ← {study ? `${study.modality} — ${study.bodyPart}` : 'Study'}
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold text-gray-900">Radiology Report</h1>
          {patient && (
            <p className="mt-0.5 text-sm text-gray-500">
              {patient.firstName} {patient.lastName}&nbsp;&middot;&nbsp;MRN {patient.mrn}
            </p>
          )}
        </div>
        <div className="mt-6 shrink-0">
          <Badge variant={reportStatusVariant[report.status]}>
            {report.status.replace('_', ' ')}
          </Badge>
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
          <Badge variant={studyPriorityVariant[study.priority]}>{study.priority}</Badge>
          <Badge variant={studyStatusVariant[study.status]}>{studyStatusLabel[study.status]}</Badge>
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
