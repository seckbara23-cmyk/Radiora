import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getMyProfile } from '@/lib/data/profile'
import { ProfileForm } from './ProfileForm'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'profileSettings' })
  return { title: t('title') }
}

export default async function ProfileSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  await requireCurrentUser()
  const t = await getTranslations('profileSettings')
  const profile = await getMyProfile()

  // Sections 4 & 5 reuse existing areas (templates / vocabulary) — linked, not
  // duplicated, so there is one source of truth for each feature.
  const linkedSections = [
    {
      n: 4,
      href: '/templates',
      title: t('sectionTemplatesTitle'),
      desc: t('sectionTemplatesDesc'),
      cta: t('sectionTemplatesLink'),
    },
    {
      n: 5,
      href: '/settings/vocabulary',
      title: t('sectionAiTitle'),
      desc: t('sectionAiDesc'),
      cta: t('sectionAiLink'),
    },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          {t('backToSettings')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <ProfileForm profile={profile} />

      {/* ── 4. Modèles de comptes-rendus · 5. Apprentissage IA ── */}
      {linkedSections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="block rounded-xl border border-gray-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-600">
              {s.n}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900">{s.title}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{s.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                {s.cta}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
