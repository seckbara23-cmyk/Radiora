import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getTemplate } from '@/lib/data/templates'
import { TemplateForm } from '../../TemplateForm'

export async function generateMetadata() {
  const t = await getTranslations('templates')
  return { title: t('editTitle') }
}

const TEMPLATE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const

type Props = { params: Promise<{ id: string }> }

export default async function EditTemplatePage({ params }: Props) {
  const t = await getTranslations('templates')
  const { id } = await params
  const user = await requireCurrentUser()

  if (!TEMPLATE_ROLES.includes(user.role as typeof TEMPLATE_ROLES[number])) {
    redirect('/templates')
  }

  const template = await getTemplate(id)
  if (!template) notFound()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/templates" className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← {t('backToTemplates')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('editTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500 truncate">{template.title}</p>
      </div>
      <TemplateForm initialData={template} />
    </div>
  )
}
