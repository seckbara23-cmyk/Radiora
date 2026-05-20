import Link from 'next/link'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getDashboardStats, getRecentStudies, getRecentReports } from '@/lib/data/dashboard'
import {
  Badge,
  studyStatusVariant,
  studyStatusLabel,
  studyPriorityVariant,
  reportStatusVariant,
} from '@/components/ui/badge'

export default async function DashboardPage() {
  const user = await requireCurrentUser()

  const [stats, recentStudies, recentReports] = await Promise.all([
    getDashboardStats(),
    getRecentStudies(5),
    getRecentReports(4),
  ])

  const kpiCards = [
    {
      label: 'Active Patients',
      value: stats.totalPatients,
      color: 'text-blue-600 bg-blue-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      label: 'Pending Studies',
      value: stats.pendingStudies,
      color: 'text-amber-600 bg-amber-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      label: 'Draft Reports',
      value: stats.draftReports,
      color: 'text-violet-600 bg-violet-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      label: 'Finalized Reports',
      value: stats.finalizedReports,
      color: 'text-emerald-600 bg-emerald-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {user.firstName || user.email}
        </p>
      </div>

      {/* Session panel */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-400">Session</p>
        <dl className="grid grid-cols-1 gap-y-2 gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['User ID',   user.id],
              ['Email',     user.email],
              ['Role',      user.role],
              ['Clinic ID', user.clinicId ?? '— (super admin)'],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-indigo-500">{label}</dt>
              <dd className="mt-0.5 font-mono text-xs text-indigo-900 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <span className={`p-2 rounded-lg ${card.color}`}>{card.icon}</span>
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Bottom layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* Recent studies — 2/3 width */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Studies</h2>
            <Link href="/studies" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          {recentStudies.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">No studies yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentStudies.map((study) => (
                <div key={study.id} className="px-6 py-3.5 flex items-center gap-4">
                  <span className="w-12 text-center flex-shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {study.modality}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{study.bodyPart}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{study.accessionNumber}</p>
                  </div>
                  <span className="hidden sm:block text-xs text-gray-400 flex-shrink-0">
                    {study.studyDate}
                  </span>
                  <Badge variant={studyPriorityVariant[study.priority]}>{study.priority}</Badge>
                  <Badge variant={studyStatusVariant[study.status]}>{studyStatusLabel[study.status]}</Badge>
                  <Link href={`/studies/${study.id}`}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0">
                    View →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent reports — 1/3 width */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Reports</h2>
            <Link href="/reports" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          {recentReports.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">No reports yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentReports.map((report) => (
                <li key={report.id}>
                  <Link href={`/reports/${report.id}`}
                    className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-mono truncate">{report.studyId.slice(0, 8)}…</p>
                      <p className="text-xs text-gray-400 mt-0.5">{report.updatedAt.slice(0, 10)}</p>
                    </div>
                    <Badge variant={reportStatusVariant[report.status]}>
                      {report.status.replace('_', ' ')}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

    </div>
  )
}
