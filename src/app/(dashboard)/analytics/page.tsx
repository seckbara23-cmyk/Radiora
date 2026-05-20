import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import {
  getWorkloadStats,
  getTatMetrics,
  getSlaStats,
  getRadiologistProductivity,
} from '@/lib/data/analytics'
import { TatChart } from './TatChart'
import { logAudit } from '@/lib/actions/audit'

export const metadata = { title: 'Analytics' }

const DAY_OPTIONS = [
  { label: '7d',  value: 7  },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

function minutesToLabel(minutes: number): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

interface PageProps {
  searchParams: Promise<{ days?: string }>
}

function StatCard({
  label, value, sub, color,
}: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

const SLA_BADGE = {
  on_time:           'bg-green-100 text-green-800',
  approaching_breach: 'bg-yellow-100 text-yellow-800',
  breached:          'bg-red-100 text-red-800',
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser()

  const allowedRoles = ['super_admin', 'clinic_admin', 'radiologist']
  if (!allowedRoles.includes(user.role)) redirect('/dashboard')

  const params  = await searchParams
  const dayRange = Math.min(Math.max(parseInt(params.days ?? '30', 10) || 30, 7), 90)

  const [workload, tat, sla, productivity] = await Promise.all([
    getWorkloadStats(),
    getTatMetrics(dayRange),
    getSlaStats(),
    getRadiologistProductivity(dayRange),
  ])

  // Log page view (fire-and-forget — audit failure never blocks the page)
  logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'analytics.viewed',
    entityType: 'clinic',
    entityId:   user.clinicId ?? user.id,
    metadata:   { dayRange },
  })

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Operational Analytics</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {user.role === 'radiologist'
              ? 'Your personal performance metrics.'
              : 'Clinic-wide operational intelligence.'}
          </p>
        </div>
        {/* Time period filter */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {DAY_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={`/analytics?days=${opt.value}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                dayRange === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Workload Cards ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Current Workload
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Pending"         value={workload.studiesPending}   color="text-amber-600" />
          <StatCard label="In Review"       value={workload.studiesInReview}  color="text-blue-600"  />
          <StatCard label="Finalized Today" value={workload.finalizedToday}   color="text-emerald-600" />
          <StatCard
            label="Urgent / STAT"
            value={`${workload.studiesUrgent} / ${workload.studiesStat}`}
            color="text-red-600"
            sub="unreported"
          />
          <StatCard
            label="Critical Open"
            value={workload.criticalOpen}
            color={workload.criticalOpen > 0 ? 'text-red-700' : 'text-gray-400'}
            sub={workload.criticalOpen > 0 ? 'needs attention' : 'none open'}
          />
        </div>
      </section>

      {/* ── TAT + SLA row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* TAT chart — 2/3 */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Turnaround Time by Modality</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Avg study-to-finalization · last {dayRange} days
                {tat.overall.count > 0 && ` · overall avg ${minutesToLabel(tat.overall.avgMinutes)}`}
              </p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-1">
              {tat.overall.count} report{tat.overall.count !== 1 ? 's' : ''}
            </span>
          </div>
          <TatChart data={tat.byModality} />
        </div>

        {/* SLA health — 1/3 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">SLA Health</h2>
          <p className="text-xs text-gray-400 mb-4">Active unreported studies</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${SLA_BADGE.on_time}`}>
                On Time
              </span>
              <span className="text-lg font-bold text-gray-900">{sla.onTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${SLA_BADGE.approaching_breach}`}>
                Approaching
              </span>
              <span className="text-lg font-bold text-yellow-700">{sla.approachingBreach}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${SLA_BADGE.breached}`}>
                Breached
              </span>
              <span className="text-lg font-bold text-red-700">{sla.breached}</span>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                {sla.totalActive > 0 ? (
                  <>
                    <div className="flex-1 rounded-full bg-gray-100 h-2 overflow-hidden flex">
                      <div
                        className="bg-green-500 h-full"
                        style={{ width: `${(sla.onTime / sla.totalActive) * 100}%` }}
                      />
                      <div
                        className="bg-yellow-400 h-full"
                        style={{ width: `${(sla.approachingBreach / sla.totalActive) * 100}%` }}
                      />
                      <div
                        className="bg-red-500 h-full"
                        style={{ width: `${(sla.breached / sla.totalActive) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{sla.totalActive}</span>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No active studies</p>
                )}
              </div>
            </div>
          </div>

          {/* Link to critical queue */}
          {workload.criticalOpen > 0 && (
            <Link
              href="/critical-queue"
              className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              {workload.criticalOpen} critical item{workload.criticalOpen !== 1 ? 's' : ''} need attention
            </Link>
          )}
        </div>

      </div>

      {/* ── Radiologist Productivity Table ─────────────────────────────────── */}
      {productivity.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {user.role === 'radiologist' ? 'Your Metrics' : 'Radiologist Productivity'} — last {dayRange} days
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Radiologist</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Total</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Finalized</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Draft</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Amended</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Avg TAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productivity.map((row) => (
                  <tr key={row.userId} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{row.firstName} {row.lastName}</p>
                      <p className="text-xs text-gray-400 font-mono">{row.userId.slice(0, 8)}…</p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{row.totalReports}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-semibold text-emerald-700">{row.finalizedCount}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-500">{row.draftCount}</td>
                    <td className="px-5 py-3.5 text-right text-amber-600 hidden sm:table-cell">{row.amendedCount || '—'}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 hidden md:table-cell">
                      {row.avgTatMinutes !== null ? minutesToLabel(row.avgTatMinutes) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {productivity.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-400">No report activity in the last {dayRange} days.</p>
        </div>
      )}

    </div>
  )
}
