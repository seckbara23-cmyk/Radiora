import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getStudies } from '@/lib/data/studies'
import { Badge, studyStatusVariant, studyStatusLabel, studyPriorityVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { StudyStatus } from '@/types/study'

type Props = {
  params:       Promise<{ locale: string }>
  searchParams: Promise<{ status?: string; priority?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'studies' })
  return { title: t('title') }
}

export default async function StudiesPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t                  = await getTranslations('studies')
  const { status, priority } = await searchParams
  await requireCurrentUser()

  const studies = await getStudies({
    status:   status   as StudyStatus | undefined,
    priority: priority as 'routine' | 'urgent' | 'stat' | undefined,
  })

  const statusTabs = [
    { label: t('all'),                    value: ''          },
    { label: t('statuses', { count: 0 } as never) || 'Pending', value: 'pending'   },
    { label: 'In Review',                 value: 'in_review' },
    { label: 'Reported',                  value: 'reported'  },
    { label: 'Validated',                 value: 'validated' },
    { label: 'Cancelled',                 value: 'cancelled' },
  ]

  // Use simple status labels for tabs
  const TAB_LABELS: Record<string, string> = {
    '':          t('all'),
    pending:     'Pending',
    in_review:   'In Review',
    reported:    'Reported',
    validated:   'Validated',
    cancelled:   'Cancelled',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{studies.length} found</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {Object.entries(TAB_LABELS).map(([value, label]) => {
          const p = new URLSearchParams()
          if (value) p.set('status', value)
          if (priority) p.set('priority', priority)
          const active = (status ?? '') === value
          return (
            <Link key={value} href={`/studies${p.toString() ? `?${p}` : ''}` as '/studies'}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              {label}
            </Link>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {studies.length === 0 ? (
          <EmptyState title={t('noStudies')} description={t('noStudiesDesc')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('accessionNumber')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('modality')} / {t('bodyPart')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">{t('studyDate')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('priority')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('status')}</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {studies.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3.5 font-mono text-xs text-gray-600">{s.accessionNumber}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="w-10 text-center shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{s.modality}</span>
                        <span className="font-medium text-gray-900">{s.bodyPart}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600 hidden sm:table-cell">{s.studyDate}</td>
                    <td className="px-6 py-3.5"><Badge variant={studyPriorityVariant[s.priority]}>{s.priority}</Badge></td>
                    <td className="px-6 py-3.5"><Badge variant={studyStatusVariant[s.status]}>{studyStatusLabel[s.status]}</Badge></td>
                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/studies/${s.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-700">→</Link>
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
