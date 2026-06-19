import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReportsList } from '@/lib/data/reports'
import { Badge, reportStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { ReportStatus } from '@/types/report'

type Props = {
  params:       Promise<{ locale: string }>
  searchParams: Promise<{ status?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'reports' })
  return { title: t('title') }
}

export default async function ReportsPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t          = await getTranslations('reports')
  const tSt        = await getTranslations('statuses')
  const { status } = await searchParams
  await requireCurrentUser()

  const reports = await getReportsList({ status: status as ReportStatus | undefined })

  const TAB_LABELS: Record<string, string> = {
    '':         t('all'),
    draft:      tSt('report.draft'),
    in_review:  tSt('report.in_review'),
    finalized:  tSt('report.finalized'),
    amended:    tSt('report.amended'),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('found', { count: reports.length })}</p>
        </div>
        {status === 'finalized' && reports.length > 0 && (
          <a
            href={`/api/vacations/export?ids=${reports.map((r) => r.id).join(',')}`}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('batchDownload' as 'all')}
          </a>
        )}
      </div>

      <div className="flex gap-1 flex-wrap">
        {Object.entries(TAB_LABELS).map(([value, label]) => {
          const p = new URLSearchParams()
          if (value) p.set('status', value)
          const active = (status ?? '') === value
          return (
            <Link key={value} href={`/reports${p.toString() ? `?${p}` : ''}` as '/reports'}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              {label}
            </Link>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {reports.length === 0 ? (
          <EmptyState title={t('noReports')} description={t('noReportsDesc')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('patient' as 'all')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">{t('study' as 'all')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">{t('updated' as 'all')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('status' as 'all')}</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3.5">
                      {r.patient ? (
                        <>
                          <p className="font-medium text-gray-900">{r.patient.firstName} {r.patient.lastName}</p>
                          <p className="text-xs text-gray-400 font-mono">{r.patient.mrn}</p>
                        </>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-3.5 hidden md:table-cell">
                      {r.study ? (
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-center shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{r.study.modality}</span>
                          <span className="text-gray-700">{r.study.bodyPart}</span>
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-gray-500 hidden sm:table-cell">{r.updatedAt.slice(0, 10)}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={reportStatusVariant[r.status]}>
                        {tSt(`report.${r.status}` as Parameters<typeof tSt>[0])}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/reports/${r.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                        {r.status === 'finalized' ? t('viewReport' as 'all') : t('editReport' as 'all')}
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
