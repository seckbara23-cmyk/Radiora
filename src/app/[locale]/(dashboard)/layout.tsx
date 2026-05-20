import { setRequestLocale } from 'next-intl/server'
import DashboardShell from '@/components/layout/dashboard-shell'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const result = await getCurrentUser()
  const user   = result.status === 'ok' ? result.user : null

  return (
    <DashboardShell
      user={user ? { firstName: user.firstName, lastName: user.lastName, role: user.role } : null}
    >
      {children}
    </DashboardShell>
  )
}
