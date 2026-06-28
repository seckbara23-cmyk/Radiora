import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getDashboardStats, getRecentStudies, getRecentReports } from '@/lib/data/dashboard'
import {
  Badge,
  studyStatusVariant,
  studyPriorityVariant,
  reportStatusVariant,
} from '@/components/ui/badge'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'dashboard' })
  return { title: t('title') }
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t    = await getTranslations('dashboard')
  const tSt  = await getTranslations('statuses')
  const tCom = await getTranslations('common')
  const user = await requireCurrentUser()

  const [stats, recentStudies, recentReports] = await Promise.all([
    getDashboardStats(),
    getRecentStudies(5),
    getRecentReports(4),
  ])

  // Presentation Screen 2 — the three primary modules the radiologist starts from.
  // Each reuses an existing area: Profil → settings/profile, Dictée vocale →
  // vacation queue, Traitement de texte → reports.
  const modules = [
    {
      key: 'profile' as const,
      href: '/settings/profile',
      accent: 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
    },
    {
      key: 'voice' as const,
      href: '/vacations',
      accent: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8" />,
    },
    {
      key: 'text' as const,
      href: '/reports',
      accent: 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
    },
  ]

  const kpiCards = [
    { labelKey: 'activePatients' as const,   value: stats.totalPatients,    color: 'text-blue-600 bg-blue-50',     icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
    { labelKey: 'pendingStudies' as const,   value: stats.pendingStudies,   color: 'text-amber-600 bg-amber-50',   icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> },
    { labelKey: 'draftReports' as const,     value: stats.draftReports,     color: 'text-violet-600 bg-violet-50', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
    { labelKey: 'finalizedReports' as const, value: stats.finalizedReports, color: 'text-emerald-600 bg-emerald-50', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('welcome', { name: user.firstName || user.email })}</p>
      </div>

      {/* Primary modules (presentation Screen 2) */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-900">{t('modulesHeading')}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{t('modulesSubtitle')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
            >
              <span className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${m.accent}`}>
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">{m.icon}</svg>
              </span>
              <h3 className="text-base font-semibold text-gray-900">{t(`modules.${m.key}.title`)}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">{t(`modules.${m.key}.description`)}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:text-blue-700">
                {t('open')}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Activity — supporting KPIs and recent items (kept, secondary) */}
      <h2 className="pt-2 text-sm font-semibold text-gray-900">{t('activityHeading')}</h2>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div key={card.labelKey} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{t(card.labelKey)}</p>
              <span className={`p-2 rounded-lg ${card.color}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{card.icon}</svg>
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Bottom layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent studies */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">{t('recentStudies')}</h2>
            <Link href="/studies" className="text-xs font-medium text-blue-600 hover:text-blue-700">{tCom('viewAll')}</Link>
          </div>
          {recentStudies.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">{t('noStudies')}</p>
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
                  <span className="hidden sm:block text-xs text-gray-400 flex-shrink-0">{study.studyDate}</span>
                  <Badge variant={studyPriorityVariant[study.priority]}>
                    {tSt(`priority.${study.priority}` as Parameters<typeof tSt>[0])}
                  </Badge>
                  <Badge variant={studyStatusVariant[study.status]}>
                    {tSt(`study.${study.status}` as Parameters<typeof tSt>[0])}
                  </Badge>
                  <Link href={`/studies/${study.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0">
                    →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent reports */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">{t('recentReports')}</h2>
            <Link href="/reports" className="text-xs font-medium text-blue-600 hover:text-blue-700">{tCom('viewAll')}</Link>
          </div>
          {recentReports.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">{t('noReports')}</p>
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
                      {tSt(`report.${report.status}` as Parameters<typeof tSt>[0])}
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
