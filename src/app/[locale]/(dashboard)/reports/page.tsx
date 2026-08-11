// R2.1 — Reports is the application landing page.
//
// Deliberately NOT the full R2 workspace redesign: this is the existing list,
// raised just far enough to be a home screen — a prominent New Report action,
// plain-language statuses, bounded retrieval and an empty state that starts the
// workflow. It reads only its own data; nothing here depends on the (frozen)
// dashboard.

import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReportsList, REPORTS_PAGE_SIZE } from '@/lib/data/reports'
import {
  reportDisplayStatus,
  internalStatusesFor,
  isReportDisplayStatus,
  displayStatusVariant,
  type ReportDisplayStatus,
} from '@/lib/reports/display-status'
import { PRODUCT_SCOPE } from '@/config/product-scope'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

type Props = {
  params:       Promise<{ locale: string }>
  searchParams: Promise<{ status?: string; page?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'reports' })
  return { title: t('title') }
}

// Filter tabs use the DISPLAY vocabulary, so no internal status name ever
// reaches the URL. 'delivered' is shown as a badge but is not a filter — it is
// a property of a signed report, not a separate stage.
const FILTERS: (ReportDisplayStatus | '')[] = ['', 'draft', 'review_required', 'signed']

export default async function ReportsPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t   = await getTranslations('reports')
  const tSt = await getTranslations('statuses')
  const { status, page } = await searchParams
  await requireCurrentUser()

  const active = status && isReportDisplayStatus(status) ? status : ''
  const pageNum = Math.max(Number(page ?? '1') || 1, 1)
  const offset  = (pageNum - 1) * REPORTS_PAGE_SIZE

  const reports = await getReportsList({
    statuses: active ? internalStatusesFor(active) : undefined,
    limit:    REPORTS_PAGE_SIZE,
    offset,
  })

  const hasNext = reports.length === REPORTS_PAGE_SIZE
  const qs = (over: { status?: string; page?: number }) => {
    const p = new URLSearchParams()
    const s = over.status ?? active
    if (s) p.set('status', s)
    if (over.page && over.page > 1) p.set('page', String(over.page))
    return p.toString() ? `?${p}` : ''
  }

  return (
    <div className="space-y-6">

      {/* Header — title + the primary action */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('found', { count: reports.length })}</p>
        </div>
        <Link
          href={PRODUCT_SCOPE.new_report.route as '/reports/new'}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('newReport')}
        </Link>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((value) => {
          const isActive = active === value
          return (
            <Link
              key={value || 'all'}
              href={`/reports${qs({ status: value, page: 1 })}` as '/reports'}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {value ? tSt(`display.${value}` as Parameters<typeof tSt>[0]) : t('all')}
            </Link>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {reports.length === 0 ? (
          <div className="px-6 py-10">
            <EmptyState title={t('noReports')} description={t('noReportsDesc')} />
            <div className="mt-6 flex justify-center">
              <Link
                href={PRODUCT_SCOPE.new_report.route as '/reports/new'}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {t('newReport')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{t('patient')}</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">{t('study' as 'all')}</th>
                  {/* R2.9 — exam date answers "which examination is this?";
                      last activity answers "what have I already done to it?".
                      The queue needs both, so they are separate columns and the
                      exam date is the one kept at the wider breakpoint. */}
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">{t('examDate')}</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:table-cell">{t('updated' as 'all')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{t('status' as 'all')}</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map((r) => {
                  const display = reportDisplayStatus(r.status, { delivered: r.delivered })
                  return (
                    <tr key={r.id} className="transition hover:bg-gray-50">
                      <td className="px-6 py-3.5">
                        {r.patient ? (
                          <>
                            <p className="font-medium text-gray-900">{r.patient.firstName} {r.patient.lastName}</p>
                            <p className="font-mono text-xs text-gray-400">{r.patient.mrn}</p>
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="hidden px-6 py-3.5 md:table-cell">
                        {r.study ? (
                          <div className="flex items-center gap-2">
                            <span className="w-10 shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-center text-xs font-semibold text-slate-700">{r.study.modality}</span>
                            <span className="text-gray-700">{r.study.bodyPart}</span>
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="hidden px-6 py-3.5 text-xs text-gray-600 md:table-cell">
                        {r.study ? r.study.studyDate : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="hidden px-6 py-3.5 text-xs text-gray-500 lg:table-cell">{r.updatedAt.slice(0, 10)}</td>
                      <td className="px-6 py-3.5">
                        <Badge variant={displayStatusVariant[display]}>{tSt(`display.${display}` as Parameters<typeof tSt>[0])}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link href={`/reports/${r.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                          {display === 'draft' || display === 'review_required'
                            ? t('editReport' as 'all')
                            : t('viewReport' as 'all')}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bounded retrieval — page through rather than silently truncating */}
      {(pageNum > 1 || hasNext) && (
        <div className="flex items-center justify-between">
          {pageNum > 1 ? (
            <Link
              href={`/reports${qs({ page: pageNum - 1 })}` as '/reports'}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← {t('previous')}
            </Link>
          ) : <span />}
          {hasNext && (
            <Link
              href={`/reports${qs({ page: pageNum + 1 })}` as '/reports'}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('next')} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
