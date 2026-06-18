import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getVacation, getQueueItems } from '@/lib/data/vacations'
import { Badge, vacationWorkflowVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ItemStatusControl } from '../ItemStatusControl'
import { AddItemForm } from './AddItemForm'
import { BatchExportControl, type BatchExportItem } from './BatchExportControl'
import type { UserRole } from '@/types/user'

const VIEW_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin']
const VALIDATE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'super_admin']
const MANAGE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']

type Props = { params: Promise<{ id: string; locale: string }> }

export default async function VacationDetailPage({ params }: Props) {
  const { id, locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  if (!VIEW_ROLES.includes(user.role)) redirect(`/${locale}/dashboard`)

  const t = await getTranslations('vacationQueue')

  const vacation = await getVacation(id)
  if (!vacation) notFound()

  const items = await getQueueItems({ vacationId: id })

  const canValidate = VALIDATE_ROLES.includes(user.role)
  const canManage   = MANAGE_ROLES.includes(user.role)
  const done = items.filter((i) => ['signed', 'printed', 'exported'].includes(i.workflowStatus)).length

  // Report-bearing items, for the batch PDF/ZIP export (Feature 9).
  const exportItems: BatchExportItem[] = items
    .filter((i) => i.reportId)
    .map((i) => ({
      reportId: i.reportId as string,
      label: i.patientName ?? i.patientLabel ?? '—',
      examNumber: i.examNumber ?? '',
      status: i.workflowStatus,
    }))

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Link href="/vacations" className="text-sm text-gray-500 hover:text-gray-700 transition">← {t('title')}</Link>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-700">{vacation.modality}</span>
          <h1 className="text-xl font-semibold text-gray-900">{vacation.title}</h1>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          {vacation.vacationDate} · {t('progress', { done, total: items.length })}
        </p>
      </div>

      {/* Add item */}
      {canManage && vacation.status === 'open' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <AddItemForm vacationId={vacation.id} />
        </div>
      )}

      {/* Batch export (Feature 9) */}
      {canManage && exportItems.length > 0 && (
        <BatchExportControl items={exportItems} vacationDate={vacation.vacationDate} />
      )}

      {/* Items board */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title={t('noItems')} description={t('noItemsDesc')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">#</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('patient')}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('examNumber')}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('status')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((i, idx) => (
                  <tr key={i.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {i.patientName ?? i.patientLabel ?? <span className="text-gray-400 italic">{t('unmatched')}</span>}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-600">{i.examNumber ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={vacationWorkflowVariant[i.workflowStatus]}>
                          {t(`status.${i.workflowStatus}` as Parameters<typeof t>[0])}
                        </Badge>
                        {canManage && (
                          <ItemStatusControl itemId={i.id} status={i.workflowStatus} canValidate={canValidate} />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/vacations/items/${i.id}`} className="text-xs font-medium text-gray-600 hover:text-gray-900">
                          {t('openWorkspace')}
                        </Link>
                        {i.reportId && (
                          <Link href={`/reports/${i.reportId}`} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                            {t('openReport')} →
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Safety note */}
      <p className="text-xs text-gray-400 max-w-2xl">{t('safetyNote')}</p>
    </div>
  )
}
