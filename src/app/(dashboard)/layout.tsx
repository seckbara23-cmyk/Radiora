import DashboardShell from '@/components/layout/dashboard-shell'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentUser()
  const user = result.status === 'ok' ? result.user : null

  return (
    <DashboardShell
      user={
        user
          ? { firstName: user.firstName, lastName: user.lastName, role: user.role }
          : null
      }
    >
      {children}
    </DashboardShell>
  )
}
