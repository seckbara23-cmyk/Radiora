import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getHospitalHeaders } from '@/lib/data/hospital-headers'
import { HospitalHeadersClient } from './HospitalHeadersClient'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'hospitalHeaders' })
  return { title: t('title') }
}

const ADMIN_ROLES = ['super_admin', 'clinic_admin'] as const

export default async function HospitalHeadersPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  const t = await getTranslations('hospitalHeaders')

  const headers = await getHospitalHeaders()
  const isAdmin = ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          {t('backToSettings')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <HospitalHeadersClient
        headers={headers}
        clinicId={user.clinicId}
        isAdmin={isAdmin}
      />
    </div>
  )
}
