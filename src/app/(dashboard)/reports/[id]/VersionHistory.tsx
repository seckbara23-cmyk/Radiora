import type { ReportVersion } from '@/lib/data/report-versions'

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 ring-gray-500/20',
  in_review: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  finalized: 'bg-green-50 text-green-700 ring-green-600/20',
  amended:   'bg-orange-50 text-orange-700 ring-orange-600/20',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export function VersionHistory({ versions }: { versions: ReportVersion[] }) {
  if (versions.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Version History
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {versions.map((v, i) => {
            const isLatest = i === 0
            const actorName = v.actorFirstName
              ? `${v.actorFirstName} ${v.actorLastName}`
              : 'System'
            const badgeCls = STATUS_BADGE[v.status] ?? 'bg-gray-100 text-gray-600 ring-gray-500/20'

            return (
              <li key={v.id} className={`px-5 py-3.5 ${isLatest ? 'bg-blue-50/50' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-gray-400 flex-shrink-0 w-6">
                      v{v.versionNumber}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset flex-shrink-0 ${badgeCls}`}
                    >
                      {v.status.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-700 truncate">
                      {actorName}
                      {v.actorRole && (
                        <span className="text-gray-400 text-xs ml-1.5">
                          ({v.actorRole.replace('_', ' ')})
                        </span>
                      )}
                    </span>
                    {isLatest && (
                      <span className="text-xs text-blue-600 font-medium flex-shrink-0">Latest</span>
                    )}
                  </div>
                  <time
                    dateTime={v.createdAt}
                    className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap"
                  >
                    {formatDateTime(v.createdAt)}
                  </time>
                </div>
                {v.changeReason && (
                  <p className="mt-1 ml-9 text-xs text-amber-700 italic">
                    Amendment reason: {v.changeReason}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
