import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { InviteUserForm } from './InviteUserForm'

export async function generateMetadata() {
  const t = await getTranslations('users')
  return { title: t('inviteTitle') }
}

export default async function InviteUserPage() {
  const t = await getTranslations('users')
  const user = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(user.role)) {
    redirect('/users')
  }

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <Link
          href="/users"
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          ← {t('backToUsers')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('inviteTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('inviteSubtitleLong')}
        </p>
      </div>

      <InviteUserForm />

    </div>
  )
}
