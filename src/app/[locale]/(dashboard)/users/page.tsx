import { Link } from '@/i18n/navigation'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getClinicUsers } from '@/lib/data/users'
import { getInviteStatuses } from '@/lib/data/user-invites'
import { Badge, userRoleVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserActions } from './UserActions'
import { ResendInvite } from './ResendInvite'

export const metadata = { title: 'Users' }

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>
}) {
  const currentUser = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(currentUser.role)) {
    redirect('/dashboard')
  }

  const t = await getTranslations('users')
  const tRoles = await getTranslations('roles')
  const { invited } = await searchParams
  const users = await getClinicUsers()
  const inviteStatuses = await getInviteStatuses(users.map((u) => u.id))

  const resendLabels = {
    resend: t('resend'),
    resending: t('resending'),
    resent: t('resent'),
  }

  const activeCount   = users.filter((u) => u.isActive).length
  const inactiveCount = users.length - activeCount

  return (
    <div className="space-y-6">

      {/* Invitation sent — keeps the inviter in the Users area (Bug B) */}
      {invited && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-medium text-emerald-800">{t('inviteSent', { email: invited })}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('countUsers', { count: users.length })}
            {' · '}
            <span className="text-emerald-600 font-medium">{t('countActive', { count: activeCount })}</span>
            {inactiveCount > 0 && (
              <span className="text-gray-400"> · {t('countInactive', { count: inactiveCount })}</span>
            )}
          </p>
        </div>
        <Link
          href="/users/new"
          className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('inviteUser')}
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {users.length === 0 ? (
          <EmptyState
            title={t('noUsersTitle')}
            description={t('noUsersDesc')}
            action={
              <Link
                href="/users/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                {t('inviteUser')}
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {t('colUser')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {t('colRole')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    {t('colSpecialty')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    {t('colLicense')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    {t('colJoined')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {t('colStatus')}
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => {
                  const initials =
                    `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase()
                  const isSelf = u.id === currentUser.id
                  const invite = inviteStatuses[u.id]
                  const awaitingAcceptance =
                    invite === 'pending' || invite === 'opened' || invite === 'expired'

                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 transition ${!u.isActive ? 'opacity-60' : ''}`}>

                      {/* User */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0 select-none">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {u.firstName} {u.lastName}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-gray-400">{t('you')}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{u.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-3.5">
                        <Badge variant={userRoleVariant[u.role]}>
                          {tRoles(u.role)}
                        </Badge>
                      </td>

                      {/* Specialty */}
                      <td className="px-6 py-3.5 text-gray-500 hidden md:table-cell">
                        {u.specialty ?? '—'}
                      </td>

                      {/* License */}
                      <td className="px-6 py-3.5 text-gray-500 font-mono text-xs hidden lg:table-cell">
                        {u.licenseNumber ?? '—'}
                      </td>

                      {/* Joined */}
                      <td className="px-6 py-3.5 text-gray-400 text-xs hidden sm:table-cell">
                        {u.createdAt.slice(0, 10)}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-3.5">
                        {!u.isActive ? (
                          <Badge variant="neutral">{t('inactive')}</Badge>
                        ) : invite === 'pending' ? (
                          <Badge variant="warning">{t('statusPending')}</Badge>
                        ) : invite === 'opened' ? (
                          <Badge variant="info">{t('statusOpened')}</Badge>
                        ) : invite === 'expired' ? (
                          <Badge variant="danger">{t('statusExpired')}</Badge>
                        ) : (
                          <Badge variant="success">{t('active')}</Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <UserActions
                            userId={u.id}
                            isActive={u.isActive}
                            isSelf={isSelf}
                          />
                          {!isSelf && u.isActive && awaitingAcceptance && (
                            <ResendInvite userId={u.id} labels={resendLabels} />
                          )}
                        </div>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
