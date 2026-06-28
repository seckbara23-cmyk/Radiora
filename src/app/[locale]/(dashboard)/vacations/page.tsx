import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import {
  getVacations,
  getQueueItems,
  getClinicRadiologists,
} from '@/lib/data/vacations'
import { Badge, vacationWorkflowVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CreateVacationForm } from './CreateVacationForm'
import { DictationOptions } from './DictationOptions'
import { TranscriptionPipeline } from './TranscriptionPipeline'
import { ItemStatusControl } from './ItemStatusControl'
import type { Modality } from '@/types/study'
import {
  VACATION_WORKFLOW_ORDER,
  type VacationStatus,
  type VacationWorkflowStatus,
} from '@/types/vacation'
import type { UserRole } from '@/types/user'

const VIEW_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin']
const VALIDATE_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'super_admin']
const MODALITIES: Modality[] = ['CT', 'MRI', 'XR', 'US', 'NM', 'PT', 'MG', 'DX', 'CR']

type Props = {
  params:       Promise<{ locale: string }>
  searchParams: Promise<{ date?: string; modality?: string; radiologistId?: string; status?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'vacationQueue' })
  return { title: t('title') }
}

const inputCls =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export default async function VacationsPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  if (!VIEW_ROLES.includes(user.role)) redirect(`/${locale}/dashboard`)

  const t = await getTranslations('vacationQueue')
  const { date, modality, radiologistId, status } = await searchParams

  const filters = {
    date:          date || undefined,
    modality:      (modality as Modality) || undefined,
    radiologistId: radiologistId || undefined,
    status:        (status as VacationWorkflowStatus) || undefined,
  }

  const [radiologists, sessions, items] = await Promise.all([
    getClinicRadiologists(),
    getVacations({
      date:          filters.date,
      modality:      filters.modality,
      radiologistId: filters.radiologistId,
    }),
    getQueueItems(filters),
  ])

  const canValidate = VALIDATE_ROLES.includes(user.role)
  const hasFilters  = Boolean(date || modality || radiologistId || status)

  return (
    <div className="space-y-6">
      {/* Header (presentation Screen 4 — Dictée vocale) */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('voiceTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('voiceSubtitle')}</p>
      </div>

      {/* Two large entry options — QR live dictation · audio import */}
      <DictationOptions radiologists={radiologists} />

      {/* Existing Vacation Audio Queue (reused, not redesigned) */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <h2 className="text-base font-semibold text-gray-900">{t('title')}</h2>
        <CreateVacationForm radiologists={radiologists} />
      </div>

      {/* Filters (GET form — server-rendered) */}
      <form className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('date')}</label>
          <input type="date" name="date" defaultValue={date ?? ''} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('modality')}</label>
          <select name="modality" defaultValue={modality ?? ''} className={inputCls}>
            <option value="">{t('allModalities')}</option>
            {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('radiologist')}</label>
          <select name="radiologistId" defaultValue={radiologistId ?? ''} className={inputCls}>
            <option value="">{t('allRadiologists')}</option>
            {radiologists.map((r) => <option key={r.id} value={r.id}>{r.lastName} {r.firstName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('status')}</label>
          <select name="status" defaultValue={status ?? ''} className={inputCls}>
            <option value="">{t('allStatuses')}</option>
            {VACATION_WORKFLOW_ORDER.map((s) => (
              <option key={s} value={s}>{t(`status.${s}` as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition">
          {t('filter')}
        </button>
        {hasFilters && (
          <Link href="/vacations" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            {t('clearFilters')}
          </Link>
        )}
      </form>

      {/* Sessions */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('sessions')}</h2>
        {sessions.length === 0 ? (
          <EmptyState title={t('noSessions')} description={t('noSessionsDesc')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => {
              const done = s.statusCounts.signed + s.statusCounts.printed + s.statusCounts.exported
              return (
                <Link
                  key={s.id}
                  href={`/vacations/${s.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{s.modality}</span>
                    <span className="text-xs text-gray-400">{s.vacationDate}</span>
                  </div>
                  <p className="mt-2 font-medium text-gray-900 truncate">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.radiologistName ? `Dr ${s.radiologistName}` : t('unassigned')}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{t('itemsCount', { count: s.itemCount })}</span>
                    <span className="font-medium text-green-700">{t('signedCount', { done, total: s.itemCount })}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Queue (flat item list) */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          {t('queue')} <span className="text-gray-400 font-normal">({items.length})</span>
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {items.length === 0 ? (
            <EmptyState title={t('noItems')} description={t('noItemsDesc')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('patient')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('examNumber')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">{t('session')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('status')}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((i) => (
                    <tr key={i.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {i.patientName ?? i.patientLabel ?? <span className="text-gray-400 italic">{t('unmatched')}</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{i.examNumber ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{i.vacationModality}</span>
                          <span className="truncate max-w-[160px]">{i.vacationTitle}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={vacationWorkflowVariant[i.workflowStatus]}>
                            {t(`status.${i.workflowStatus}` as Parameters<typeof t>[0])}
                          </Badge>
                          <ItemStatusControl itemId={i.id} status={i.workflowStatus} canValidate={canValidate} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {i.reportId ? (
                          <Link href={`/reports/${i.reportId}`} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                            {t('openReport')} →
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Automatic AI processing pipeline (visual, informational) */}
      <TranscriptionPipeline />
    </div>
  )
}
