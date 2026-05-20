import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getClinicUsers } from '@/lib/data/users'
import { Badge, userRoleVariant, userRoleLabel } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserActions } from './UserActions'

export const metadata = { title: 'Users' }

export default async function UsersPage() {
  const currentUser = await requireCurrentUser()

  if (!['clinic_admin', 'super_admin'].includes(currentUser.role)) {
    redirect('/dashboard')
  }

  const users = await getClinicUsers()

  const activeCount   = users.filter((u) => u.isActive).length
  const inactiveCount = users.length - activeCount

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.length} user{users.length !== 1 ? 's' : ''}
            {' · '}
            <span className="text-emerald-600 font-medium">{activeCount} active</span>
            {inactiveCount > 0 && (
              <span className="text-gray-400"> · {inactiveCount} inactive</span>
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
          Invite User
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {users.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="Invite your first team member to get started."
            action={
              <Link
                href="/users/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Invite User
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Specialty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    License
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => {
                  const initials =
                    `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase()
                  const isSelf = u.id === currentUser.id

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
                                <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{u.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-3.5">
                        <Badge variant={userRoleVariant[u.role]}>
                          {userRoleLabel[u.role]}
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
                        <Badge variant={u.isActive ? 'success' : 'neutral'}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        <UserActions
                          userId={u.id}
                          isActive={u.isActive}
                          isSelf={isSelf}
                        />
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
