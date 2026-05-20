import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getAuditLogs } from '@/lib/data/audit'

export const metadata = { title: 'Audit History' }

const ENTITY_TABS = [
  { label: 'All',       value: ''          },
  { label: 'Reports',   value: 'report'    },
  { label: 'Templates', value: 'template'  },
  { label: 'Patients',  value: 'patient'   },
  { label: 'Studies',   value: 'study'     },
  { label: 'Users',     value: 'user'      },
] as const

const EVENT_LABELS: Record<string, string> = {
  // Translations
  'translation.generated':             'Translation generated',
  'translation.approved':              'Translation approved',
  'translation.rejected':              'Translation rejected',
  'translation.archived':              'Translation archived',
  // AI
  'ai.draft_generated':                'AI draft generated',
  'ai.draft_accepted':                 'AI draft accepted',
  'ai.draft_rejected':                 'AI draft rejected',
  // Patient explanations
  'patient_explanation.generated':     'Explanation generated',
  'patient_explanation.approved':      'Explanation approved',
  'patient_explanation.rejected':      'Explanation rejected',
  'patient_explanation.archived':      'Explanation archived',
  // Reports
  'report.created':        'Report created',
  'report.saved':          'Draft saved',
  'report.finalized':      'Report finalized',
  'report.amended':        'Report amended',
  // Templates
  'template.created':      'Template created',
  'template.updated':      'Template updated',
  'template.deactivated':  'Template deactivated',
  'template.activated':    'Template reactivated',
  // Patients
  'patient.created':       'Patient created',
  'patient.updated':       'Patient updated',
  // Studies
  'study.created':         'Study uploaded',
  'study.status_updated':  'Study status changed',
  // Users
  'user.invited':          'User invited',
  'user.deactivated':      'User deactivated',
  'user.reactivated':      'User reactivated',
}

const BADGE_COLORS: Record<string, string> = {
  // Translations
  'translation.generated':             'bg-violet-50 text-violet-700 ring-violet-600/20',
  'translation.approved':              'bg-green-50 text-green-700 ring-green-600/20',
  'translation.rejected':              'bg-red-50 text-red-700 ring-red-600/20',
  'translation.archived':              'bg-gray-50 text-gray-600 ring-gray-500/20',
  // AI
  'ai.draft_generated':                'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'ai.draft_accepted':                 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'ai.draft_rejected':                 'bg-gray-50 text-gray-600 ring-gray-500/20',
  // Patient explanations
  'patient_explanation.generated':     'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'patient_explanation.approved':      'bg-green-50 text-green-700 ring-green-600/20',
  'patient_explanation.rejected':      'bg-red-50 text-red-700 ring-red-600/20',
  'patient_explanation.archived':      'bg-gray-50 text-gray-600 ring-gray-500/20',
  // Reports
  'report.created':        'bg-sky-50 text-sky-700 ring-sky-600/20',
  'report.saved':          'bg-gray-50 text-gray-600 ring-gray-500/20',
  'report.finalized':      'bg-green-50 text-green-700 ring-green-600/20',
  'report.amended':        'bg-orange-50 text-orange-700 ring-orange-600/20',
  // Templates
  'template.created':      'bg-violet-50 text-violet-700 ring-violet-600/20',
  'template.updated':      'bg-violet-50 text-violet-700 ring-violet-600/20',
  'template.deactivated':  'bg-gray-50 text-gray-600 ring-gray-500/20',
  'template.activated':    'bg-violet-50 text-violet-700 ring-violet-600/20',
  // Patients
  'patient.created':       'bg-green-50 text-green-700 ring-green-600/20',
  'patient.updated':       'bg-blue-50 text-blue-700 ring-blue-600/20',
  // Studies
  'study.created':         'bg-purple-50 text-purple-700 ring-purple-600/20',
  'study.status_updated':  'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  // Users
  'user.invited':          'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'user.deactivated':      'bg-red-50 text-red-700 ring-red-600/20',
  'user.reactivated':      'bg-green-50 text-green-700 ring-green-600/20',
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

interface PageProps {
  searchParams: Promise<{ entity?: string }>
}

export default async function AuditPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(user.role)) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const entityType = params.entity ?? ''

  const logs = await getAuditLogs({ entityType: entityType || undefined })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Audit History</h1>
        <p className="mt-1 text-sm text-gray-500">
          Activity log for your clinic — {logs.length} event{logs.length !== 1 ? 's' : ''} shown.
        </p>
      </div>

      {/* Entity type tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {ENTITY_TABS.map((tab) => {
          const isActive = entityType === tab.value
          return (
            <Link
              key={tab.value}
              href={tab.value ? `/audit?entity=${tab.value}` : '/audit'}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <p className="text-sm text-gray-500">No audit events found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {logs.map((entry) => {
              const label = EVENT_LABELS[entry.action] ?? entry.action
              const badgeCls = BADGE_COLORS[entry.action] ?? 'bg-gray-50 text-gray-600 ring-gray-500/20'
              const actorName = entry.actorFirstName
                ? `${entry.actorFirstName} ${entry.actorLastName}`
                : 'System'
              const hasMetadata = Object.keys(entry.metadata).length > 0

              return (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset flex-shrink-0 mt-0.5 ${badgeCls}`}
                      >
                        {label}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{actorName}</span>
                          {entry.actorRole && (
                            <span className="text-gray-400 text-xs ml-1.5">
                              ({entry.actorRole.replace(/_/g, ' ')})
                            </span>
                          )}
                        </p>
                        {entry.entityId && (
                          <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">
                            {entry.entityType}/{entry.entityId}
                          </p>
                        )}
                        {hasMetadata && (
                          <details className="mt-1.5 group">
                            <summary className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer list-none select-none">
                              <span className="group-open:hidden">Show details</span>
                              <span className="hidden group-open:inline">Hide details</span>
                            </summary>
                            <pre className="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(entry.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                    <time
                      dateTime={entry.createdAt}
                      className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap mt-0.5"
                    >
                      {formatDateTime(entry.createdAt)}
                    </time>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
