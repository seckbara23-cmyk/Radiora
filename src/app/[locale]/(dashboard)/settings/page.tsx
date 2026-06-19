import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'settings' })
  return { title: t('title') }
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('settings')
  const te = await getTranslations('exams')
  await requireCurrentUser()

  // Real, navigable settings areas (built out as features land).
  const links = [
    { href: '/settings/exams', title: te('title'), desc: te('description') },
  ]

  const sections = [
    { key: 'profile' as const,       descKey: 'Profile' },
    { key: 'notifications' as const,  descKey: 'Notifications' },
    { key: 'security' as const,       descKey: 'Security' },
    { key: 'language' as const,       descKey: 'Language' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('comingSoonDesc')}</p>
      </div>
      <div className="space-y-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block bg-white rounded-xl border border-gray-200 px-6 py-5 transition hover:border-blue-300 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{l.title}</h2>
                <p className="mt-0.5 max-w-xl text-sm text-gray-500">{l.desc}</p>
              </div>
              <span className="ml-4 flex-shrink-0 text-sm font-medium text-blue-600">{t('configure')}</span>
            </div>
          </Link>
        ))}
        {sections.map((section) => (
          <div key={section.key}
            className="bg-white rounded-xl border border-gray-200 px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t(section.key)}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{t('comingSoon')}</p>
            </div>
            <button className="text-sm font-medium text-blue-600 hover:text-blue-700 transition flex-shrink-0 ml-4">
              {t('configure')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
