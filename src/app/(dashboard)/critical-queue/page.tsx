import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getCriticalQueueItems } from '@/lib/data/analytics'
import { logAudit } from '@/lib/actions/audit'

export const metadata = { title: 'Critical Queue' }

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 ring-red-600/20',
  high:     'bg-orange-100 text-orange-800 ring-orange-600/20',
  moderate: 'bg-yellow-100 text-yellow-800 ring-yellow-600/20',
  low:      'bg-green-100 text-green-800 ring-green-600/20',
}

const TYPE_BADGE: Record<string, string> = {
  ai_finding:   'bg-teal-50 text-teal-700',
  manual_flag:  'bg-red-50 text-red-700',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

interface PageProps {
  searchParams: Promise<{ severity?: string }>
}

export default async function CriticalQueuePage({ searchParams }: PageProps) {
  const user = await requireCurrentUser()

  const canView = ['super_admin', 'clinic_admin', 'radiologist', 'technician'].includes(user.role)
  if (!canView) redirect('/dashboard')

  const params   = await searchParams
  const sevFilter = params.severity ?? ''

  const allItems = await getCriticalQueueItems()
  const items    = sevFilter
    ? allItems.filter((i) => i.severity === sevFilter)
    : allItems

  logAudit({
    userId:   user.id,
    clinicId: user.clinicId,
    action:   'critical_queue.viewed',
    entityType: 'clinic',
    entityId: user.clinicId ?? user.id,
    metadata: { totalItems: allItems.length },
  })

  const counts = {
    critical: allItems.filter((i) => i.severity === 'critical').length,
    high:     allItems.filter((i) => i.severity === 'high').length,
    moderate: allItems.filter((i) => i.severity === 'moderate').length,
    low:      allItems.filter((i) => i.severity === 'low').length,
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Critical Queue</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Unresolved critical and high-severity findings requiring clinician attention.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: 'Critical', key: 'critical', cls: 'border-red-200 bg-red-50',     numCls: 'text-red-700'    },
            { label: 'High',     key: 'high',     cls: 'border-orange-200 bg-orange-50', numCls: 'text-orange-700' },
            { label: 'Moderate', key: 'moderate', cls: 'border-yellow-200 bg-yellow-50', numCls: 'text-yellow-700' },
            { label: 'Low',      key: 'low',      cls: 'border-gray-200 bg-gray-50',   numCls: 'text-gray-600'   },
          ] as const
        ).map(({ label, key, cls, numCls }) => (
          <Link
            key={key}
            href={sevFilter === key ? '/critical-queue' : `/critical-queue?severity=${key}`}
            className={`rounded-xl border p-4 transition hover:opacity-80 ${cls} ${sevFilter === key ? 'ring-2 ring-offset-1 ring-current' : ''}`}
          >
            <p className="text-xs font-medium text-gray-600">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${numCls}`}>{counts[key]}</p>
          </Link>
        ))}
      </div>

      {/* Filter breadcrumb */}
      {sevFilter && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Showing:</span>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_BADGE[sevFilter] ?? ''}`}>
            {sevFilter.toUpperCase()}
          </span>
          <Link href="/critical-queue" className="text-xs text-blue-600 hover:text-blue-700">Clear filter</Link>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <svg className="w-10 h-10 text-green-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-700">
            {sevFilter ? `No open ${sevFilter} items.` : 'No critical items in queue.'}
          </p>
          <p className="text-xs text-gray-400 mt-1">All findings have been reviewed.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {items.length} item{items.length !== 1 ? 's' : ''} open
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {items.map((item) => (
              <li key={`${item.type}-${item.id}`} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_BADGE[item.severity] ?? SEVERITY_BADGE.low}`}>
                        {item.severity.toUpperCase()}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${TYPE_BADGE[item.type] ?? ''}`}>
                        {item.type === 'ai_finding' ? 'AI Finding' : 'Manual Flag'}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-gray-900">{item.label}</p>

                    {item.description && (
                      <p className="text-xs text-gray-500 italic">→ {item.description}</p>
                    )}

                    <p className="text-xs text-gray-400">{formatDateTime(item.createdAt)}</p>
                  </div>

                  {/* Links to study/report */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.studyId && (
                      <Link
                        href={`/studies/${item.studyId}/external-ai`}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 px-2.5 py-1.5 rounded-lg transition"
                      >
                        Review AI →
                      </Link>
                    )}
                    {item.reportId && (
                      <Link
                        href={`/reports/${item.reportId}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition"
                      >
                        View Report →
                      </Link>
                    )}
                    {item.studyId && !item.reportId && (
                      <Link
                        href={`/studies/${item.studyId}`}
                        className="text-xs font-medium text-gray-600 hover:text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition"
                      >
                        View Study →
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
