import { mockUsers } from '@/lib/mock-data'
import { Badge, userRoleVariant, userRoleLabel } from '@/components/ui/badge'

export default function AdminUsersPage() {
  const activeCount = mockUsers.filter((u) => u.isActive).length

  return (
    <div className="min-h-full bg-gray-50 py-8 px-4 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Admin</p>
            <h1 className="text-xl font-semibold text-gray-900">Users</h1>
            <p className="mt-1 text-sm text-gray-500">
              {mockUsers.length} users &mdash; {activeCount} active
            </p>
          </div>
          <button className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
            Invite User
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Specialty</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mockUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0">
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={userRoleVariant[user.role]}>
                        {userRoleLabel[user.role]}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 hidden md:table-cell">
                      {user.specialty ?? '—'}
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 hidden lg:table-cell">
                      {user.lastLoginAt ? user.lastLoginAt.slice(0, 10) : '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={user.isActive ? 'success' : 'neutral'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
