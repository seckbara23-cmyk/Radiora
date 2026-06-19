import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { STARTER_TEMPLATES, STARTER_LIBRARY_AUTHOR } from '@/config/starter-templates'
import { ImportClient } from './ImportClient'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'templateImport' })
  return { title: t('title') }
}

const IMPORT_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const

export default async function TemplateImportPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  if (!IMPORT_ROLES.includes(user.role as typeof IMPORT_ROLES[number])) {
    redirect('/dashboard')
  }

  return (
    <ImportClient
      starterCount={STARTER_TEMPLATES.length}
      starterAuthor={STARTER_LIBRARY_AUTHOR}
    />
  )
}
