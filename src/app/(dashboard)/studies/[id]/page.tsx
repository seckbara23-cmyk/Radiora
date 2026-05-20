import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getReportByStudy } from '@/lib/data/reports'
import { createReport } from '@/lib/actions/reports'
import {
  Badge,
  studyStatusVariant,
  studyStatusLabel,
  studyPriorityVariant,
  reportStatusVariant,
} from '@/components/ui/badge'
import { StudyStatusForm } from './StudyStatusForm'

type Props = { params: Promise<{ id: string }> }

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className={`mt-0.5 text-sm text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  )
}

export default async function StudyDetailPage({ params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()

  const study = await getStudy(id)
  if (!study) notFound()

  const [patient, report] = await Promise.all([
    getPatient(study.patientId),
    getReportByStudy(id),
  ])

  const canCreateReport   = ['super_admin', 'clinic_admin', 'radiologist'].includes(user.role)
  const canUpdateStatus   = ['super_admin', 'clinic_admin', 'radiologist', 'technician'].includes(user.role)
  const canViewExternalAi = ['super_admin', 'clinic_admin', 'radiologist', 'technician'].includes(user.role)
  // bind prefills prevState so this can be used as a direct form action
  const createReportAction = createReport.bind(null, { error: null }) as unknown as (formData: FormData) => Promise<void>

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/studies" className="text-sm text-gray-500 hover:text-gray-700 transition">
            ← Studies
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold text-gray-900">
            {study.modality} — {study.bodyPart}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-gray-400">{study.accessionNumber}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-6">
          <Badge variant={studyPriorityVariant[study.priority]}>{study.priority}</Badge>
          <Badge variant={studyStatusVariant[study.status]}>{studyStatusLabel[study.status]}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Left: study details + patient */}
        <div className="lg:col-span-2 space-y-6">

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Study Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="Modality"            value={study.modality} />
              <Field label="Body Part"           value={study.bodyPart} />
              <Field label="Study Date"          value={study.studyDate} />
              <Field label="Priority"            value={study.priority.charAt(0).toUpperCase() + study.priority.slice(1)} />
              <Field label="Referring Physician" value={study.referringPhysician || null} />
              <Field label="Accession"           value={study.accessionNumber} mono />
            </dl>
            {study.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <dt className="text-xs font-medium text-gray-500">Clinical Indication</dt>
                <dd className="mt-1 text-sm text-gray-900">{study.description}</dd>
              </div>
            )}
          </div>

          {patient && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Patient</h2>
                <Link href={`/patients/${patient.id}`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  View record →
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Name"          value={`${patient.firstName} ${patient.lastName}`} />
                <Field label="MRN"           value={patient.mrn} mono />
                <Field label="Date of Birth" value={patient.dateOfBirth} />
                <Field label="Sex"           value={patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)} />
              </dl>
            </div>
          )}

        </div>

        {/* Right: report + status update */}
        <div className="space-y-6">

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Report</h2>
            {report ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={reportStatusVariant[report.status]}>
                    {report.status.replace('_', ' ')}
                  </Badge>
                  {report.signedAt && (
                    <span className="text-xs text-gray-400">
                      Signed {report.signedAt.slice(0, 10)}
                    </span>
                  )}
                </div>
                <Link href={`/reports/${report.id}`}
                  className="block w-full text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                  {report.status === 'finalized' || report.status === 'amended'
                    ? 'View Report'
                    : 'Edit Report'}
                </Link>
              </div>
            ) : canCreateReport ? (
              <form action={createReportAction} className="space-y-3">
                <input type="hidden" name="study_id"   value={study.id} />
                <input type="hidden" name="patient_id" value={study.patientId} />
                <p className="text-sm text-gray-500">No report has been created for this study yet.</p>
                <button type="submit"
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
                  Create Report
                </button>
              </form>
            ) : (
              <p className="text-sm text-gray-500">No report yet.</p>
            )}
          </div>

          {canViewExternalAi && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">External AI</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Review AI image analysis results imported for this study.
              </p>
              <Link
                href={`/studies/${study.id}/external-ai`}
                className="block w-full text-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition"
              >
                External AI Results
              </Link>
            </div>
          )}

          {canUpdateStatus && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Update Status</h2>
              <StudyStatusForm studyId={study.id} currentStatus={study.status} />
            </div>
          )}

        </div>

      </div>

    </div>
  )
}
