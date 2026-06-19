import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OnboardingWizard } from './OnboardingWizard'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('onboarding.title') }
}

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin/clinics" className="text-sm text-blue-600 hover:text-blue-700">
          ← {t('nav.clinics')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('onboarding.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('onboarding.subtitle')}</p>
      </div>
      <OnboardingWizard />
    </div>
  )
}
