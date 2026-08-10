import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { TemplateForm } from '../TemplateForm'

export async function generateMetadata() {
  const t = await getTranslations('templates')
  return { title: t('createTitle') }
}

const TEMPLATE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const

export default async function NewTemplatePage() {
  const t = await getTranslations('templates')
  const user = await requireCurrentUser()

  if (!TEMPLATE_ROLES.includes(user.role as typeof TEMPLATE_ROLES[number])) {
    redirect('/templates')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/templates" className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← {t('backToTemplates')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('createTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('newSubtitle')}
        </p>
      </div>
      <TemplateForm />
    </div>
  )
}
