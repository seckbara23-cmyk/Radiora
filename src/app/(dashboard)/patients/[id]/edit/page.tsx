import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getPatient } from '@/lib/data/patients'
import { PatientEditForm } from './PatientEditForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditPatientPage({ params }: Props) {
  const { id } = await params
  await requireCurrentUser()

  const patient = await getPatient(id)
  if (!patient) notFound()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/patients/${id}`} className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Back to Patient
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">
          Edit — {patient.firstName} {patient.lastName}
        </h1>
      </div>
      <PatientEditForm patient={patient} />
    </div>
  )
}
