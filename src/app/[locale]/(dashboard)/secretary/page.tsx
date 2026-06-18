import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getSecretaryItems } from '@/lib/data/audio'
import { Badge, vacationWorkflowVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { UserRole } from '@/types/user'
import type { VacationWorkflowStatus } from '@/types/vacation'

const VIEW_ROLES: UserRole[] = ['clinic_admin', 'radiologist', 'secretary', 'super_admin']
const TABS: (VacationWorkflowStatus | 'all')[] = ['all', 'audio_received', 'transcribing', 'secretary_review']

type Props = {
  params:       Promise<{ locale: string }>
  searchParams: Promise<{ status?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'secretary' })
  return { title: t('title') }
}

export default async function SecretaryPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  if (!VIEW_ROLES.includes(user.role)) redirect(`/${locale}/dashboard`)

  const t  = await getTranslations('secretary')
  const tq = await getTranslations('vacationQueue')
  const { status } = await searchParams

  const active = (TABS as string[]).includes(status ?? '') ? (status as VacationWorkflowStatus) : undefined
  const items = await getSecretaryItems({ status: active })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 pb-3">
        {TABS.map((tab) => {
          const isActive = tab === 'all' ? !active : active === tab
          const href = tab === 'all' ? '/secretary' : `/secretary?status=${tab}`
          return (
            <Link
              key={tab}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'all' ? t('allTab') : tq(`status.${tab}` as Parameters<typeof tq>[0])}
            </Link>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title={t('empty')} description={t('emptyDesc')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{tq('patient')}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">{tq('session')}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('audio')}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{tq('status')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {i.patientName ?? i.patientLabel ?? <span className="text-gray-400 italic">{tq('unmatched')}</span>}
                      {i.examNumber && <span className="ml-2 font-mono text-xs text-gray-400">#{i.examNumber}</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{i.vacationModality}</span>
                        <span className="truncate max-w-[160px]">{i.vacationTitle}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {i.hasAudio ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">● {t('audioReady')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">○ {t('audioMissing')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={vacationWorkflowVariant[i.workflowStatus]}>
                        {tq(`status.${i.workflowStatus}` as Parameters<typeof tq>[0])}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/vacations/items/${i.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {t('open')} →
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
