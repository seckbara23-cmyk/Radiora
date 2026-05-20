import Link from 'next/link'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReportsList } from '@/lib/data/reports'
import { Badge, reportStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { ReportStatus } from '@/types/report'

type Props = {
  searchParams: Promise<{ status?: string }>
}

const STATUS_TABS: Array<{ label: string; value: ReportStatus | '' }> = [
  { label: 'All',       value: '' },
  { label: 'Draft',     value: 'draft' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Finalized', value: 'finalized' },
  { label: 'Amended',   value: 'amended' },
]

const reportStatusLabel: Record<ReportStatus, string> = {
  draft:     'Draft',
  in_review: 'In Review',
  finalized: 'Finalized',
  amended:   'Amended',
}

export default async function ReportsPage({ searchParams }: Props) {
  const { status } = await searchParams
  await requireCurrentUser()

  const reports = await getReportsList({
    status: status as ReportStatus | undefined,
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            {reports.length} report{reports.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(({ label, value }) => {
          const p = new URLSearchParams()
          if (value) p.set('status', value)
          const active = (status ?? '') === value
          return (
            <Link
              key={value}
              href={`/reports${p.toString() ? `?${p}` : ''}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {reports.length === 0 ? (
          <EmptyState
            title="No reports found"
            description="Reports are created from a study detail page once a study is ready for reporting."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Study</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Updated</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3.5">
                      {r.patient ? (
                        <>
                          <p className="font-medium text-gray-900">
                            {r.patient.firstName} {r.patient.lastName}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{r.patient.mrn}</p>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 hidden md:table-cell">
                      {r.study ? (
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-center shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                            {r.study.modality}
                          </span>
                          <span className="text-gray-700">{r.study.bodyPart}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-gray-500 hidden sm:table-cell">
                      {r.updatedAt.slice(0, 10)}
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={reportStatusVariant[r.status]}>
                        {reportStatusLabel[r.status]}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link
                        href={`/reports/${r.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {r.status === 'finalized' ? 'View' : 'Edit'} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
