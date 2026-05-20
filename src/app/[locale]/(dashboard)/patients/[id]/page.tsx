import { Link } from '@/i18n/navigation'
import { notFound } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getPatient } from '@/lib/data/patients'
import { getStudiesByPatient } from '@/lib/data/studies'
import { Badge, patientStatusVariant, studyStatusVariant, studyPriorityVariant, studyStatusLabel } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

type Props = { params: Promise<{ id: string }> }

function age(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  )
}

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params
  await requireCurrentUser()

  const [patient, studies] = await Promise.all([
    getPatient(id),
    getStudiesByPatient(id),
  ])

  if (!patient) notFound()

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/patients" className="text-sm text-gray-500 hover:text-gray-700 transition">
            ← Patients
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold text-gray-900">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">MRN: {patient.mrn}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={patientStatusVariant[patient.status]}>{patient.status}</Badge>
          <Link
            href={`/patients/${id}/edit`}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Patient info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Patient Information</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Date of Birth" value={`${patient.dateOfBirth} (${age(patient.dateOfBirth)}y)`} />
          <Field label="Sex"           value={patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)} />
          <Field label="Phone"         value={patient.phone} />
          <Field label="Email"         value={patient.email} />
        </dl>
      </div>

      {/* Studies section */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Studies
            {studies.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-500">({studies.length})</span>
            )}
          </h2>
          <Link
            href={`/patients/${id}/studies/new`}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Study
          </Link>
        </div>

        {studies.length === 0 ? (
          <EmptyState
            title="No studies yet"
            description="Add a study to begin the radiology workflow."
            action={
              <Link
                href={`/patients/${id}/studies/new`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Add Study
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {studies.map((s) => (
              <div key={s.id} className="px-6 py-3.5 flex items-center gap-4">
                <span className="w-12 text-center shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {s.modality}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.bodyPart}</p>
                  <p className="text-xs text-gray-400 truncate">{s.description}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{s.studyDate}</span>
                <Badge variant={studyPriorityVariant[s.priority]}>{s.priority}</Badge>
                <Badge variant={studyStatusVariant[s.status]}>{studyStatusLabel[s.status]}</Badge>
                <Link
                  href={`/studies/${s.id}`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0"
                >
                  View →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
