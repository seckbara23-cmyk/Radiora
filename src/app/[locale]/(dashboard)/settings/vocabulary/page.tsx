import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getPersonalVocabulary, getClinicVocabulary } from '@/lib/data/vocabulary'
import { VocabularyClient } from './VocabularyClient'

const ADMIN_ROLES = ['super_admin', 'clinic_admin'] as const

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'vocabulary' })
  return { title: t('title') }
}

export default async function VocabularyPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireCurrentUser()
  const t = await getTranslations('vocabulary')

  const [personal, clinic] = await Promise.all([
    getPersonalVocabulary(),
    getClinicVocabulary(),
  ])
  const isAdmin = ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          {t('backToSettings')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-800">
        {t('safetyNote')}
      </div>

      <VocabularyClient personal={personal} clinic={clinic} isAdmin={isAdmin} />
    </div>
  )
}
