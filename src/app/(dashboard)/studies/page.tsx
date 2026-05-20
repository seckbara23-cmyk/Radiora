import Link from 'next/link'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getStudies } from '@/lib/data/studies'
import {
  Badge,
  studyStatusVariant,
  studyStatusLabel,
  studyPriorityVariant,
} from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { StudyStatus } from '@/types/study'

type Props = {
  searchParams: Promise<{ status?: string; priority?: string }>
}

const STATUS_TABS: Array<{ label: string; value: StudyStatus | '' }> = [
  { label: 'All',       value: ''          },
  { label: 'Pending',   value: 'pending'   },
  { label: 'In Review', value: 'in_review' },
  { label: 'Reported',  value: 'reported'  },
  { label: 'Validated', value: 'validated' },
  { label: 'Cancelled', value: 'cancelled' },
]

export default async function StudiesPage({ searchParams }: Props) {
  const { status, priority } = await searchParams
  await requireCurrentUser()

  const studies = await getStudies({
    status:   status   as StudyStatus | undefined,
    priority: priority as 'routine' | 'urgent' | 'stat' | undefined,
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Studies</h1>
          <p className="mt-1 text-sm text-gray-500">
            {studies.length} stud{studies.length !== 1 ? 'ies' : 'y'} found
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(({ label, value }) => {
          const p = new URLSearchParams()
          if (value) p.set('status', value)
          if (priority) p.set('priority', priority)
          const active = (status ?? '') === value
          return (
            <Link key={value} href={`/studies${p.toString() ? `?${p}` : ''}`}
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
        {studies.length === 0 ? (
          <EmptyState
            title="No studies found"
            description="Studies appear here after they are added from a patient record."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Accession</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Modality / Region</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {studies.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3.5 font-mono text-xs text-gray-600">{s.accessionNumber}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="w-10 text-center shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                          {s.modality}
                        </span>
                        <span className="font-medium text-gray-900">{s.bodyPart}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600 hidden sm:table-cell">{s.studyDate}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={studyPriorityVariant[s.priority]}>{s.priority}</Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={studyStatusVariant[s.status]}>{studyStatusLabel[s.status]}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/studies/${s.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View →
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
