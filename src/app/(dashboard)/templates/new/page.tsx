import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { TemplateForm } from '../TemplateForm'

export const metadata = { title: 'New Template' }

const TEMPLATE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const

export default async function NewTemplatePage() {
  const user = await requireCurrentUser()

  if (!TEMPLATE_ROLES.includes(user.role as typeof TEMPLATE_ROLES[number])) {
    redirect('/templates')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/templates" className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Back to Templates
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">New Template</h1>
        <p className="mt-1 text-sm text-gray-500">
          Templates can be applied in the report editor to pre-fill standard text.
        </p>
      </div>
      <TemplateForm />
    </div>
  )
}
