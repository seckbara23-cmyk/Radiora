import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalBar } from '@/components/ui/senegal-accents'
import { SignupWizard } from './SignupWizard'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'signup' })
  return { title: t('title') }
}

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('signup')

  return (
    <div className="min-h-full bg-gray-50 bg-sn-pattern py-12 px-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
        </div>

        <SenegalBar className="rounded-t-2xl" />
        <div className="rounded-b-2xl border border-t-0 border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <SignupWizard />
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            {t('signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
