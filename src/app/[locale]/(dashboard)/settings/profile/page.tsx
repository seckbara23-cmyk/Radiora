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
    </div>
  )
}
