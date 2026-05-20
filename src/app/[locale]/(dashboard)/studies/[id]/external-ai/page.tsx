import { Link } from '@/i18n/navigation'
import { notFound, redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getStudy } from '@/lib/data/studies'
import { getReportByStudy } from '@/lib/data/reports'
import { getExternalAiResultsByStudy } from '@/lib/data/external-ai'
import { ExternalAiClient } from './ExternalAiClient'

type Props = { params: Promise<{ id: string }> }

export default async function ExternalAiPage({ params }: Props) {
  const { id } = await params
  const user   = await requireCurrentUser()

  const canView   = ['super_admin', 'clinic_admin', 'radiologist', 'technician'].includes(user.role)
  const canManage = ['super_admin', 'clinic_admin', 'radiologist'].includes(user.role)

  if (!canView) redirect(`/studies/${id}`)

  const study = await getStudy(id)
  if (!study) notFound()

  const [report, results] = await Promise.all([
    getReportByStudy(id),
    getExternalAiResultsByStudy(id),
  ])

  const studyLabel = `${study.modality} — ${study.bodyPart}`

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <Link href={`/studies/${id}`} className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← {studyLabel}
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold text-gray-900">External AI Results</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Review and manage AI image analysis imported for this study.
        </p>
      </div>

      {/* Safety warning */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <p className="text-xs text-amber-800 leading-relaxed">
          <span className="font-semibold">External AI results are decision-support only</span> and must be
          reviewed by a licensed clinician before any clinical use. Individual findings must be explicitly
          accepted or rejected. Accepted findings are never applied to a report automatically.
        </p>
      </div>

      {/* Interactive client shell */}
      <ExternalAiClient
        studyId={id}
        reportId={report?.id ?? null}
        canManage={canManage}
        initialData={results}
      />

    </div>
  )
}
