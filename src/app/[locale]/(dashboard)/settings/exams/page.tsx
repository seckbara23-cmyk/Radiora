import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getExamCatalog } from '@/lib/data/exam-catalog'
import { ExamCatalogClient } from './ExamCatalogClient'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'exams' })
  return { title: t('title') }
}

const ADMIN_ROLES = ['super_admin', 'clinic_admin'] as const

export default async function ExamCatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  const t = await getTranslations('exams')

  const entries = await getExamCatalog()
  const specialCount = entries.filter((e) => e.specialLayout).length
  const isAdmin = ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          {t('backToSettings')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('subtitle', { count: entries.length, special: specialCount })}
        </p>
        <p className="mt-1 max-w-2xl text-sm text-gray-400">{t('description')}</p>
      </div>

      <ExamCatalogClient entries={entries} locale={locale} isAdmin={isAdmin} />
    </div>
  )
}
