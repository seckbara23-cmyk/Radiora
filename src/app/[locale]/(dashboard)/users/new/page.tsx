import { Link } from '@/i18n/navigation'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { InviteUserForm } from './InviteUserForm'

export const metadata = { title: 'Invite User' }

export default async function InviteUserPage() {
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
          ← Back to Users
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Invite User</h1>
        <p className="mt-1 text-sm text-gray-500">
          An invitation email will be sent. The user sets their own password when they accept.
        </p>
      </div>

      <InviteUserForm />

    </div>
  )
}
