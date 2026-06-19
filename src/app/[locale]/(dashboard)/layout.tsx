import { setRequestLocale } from 'next-intl/server'
import DashboardShell from '@/components/layout/dashboard-shell'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getClinicAccess } from '@/lib/billing/access'
import { SubscriptionBanner } from '@/components/billing/SubscriptionBanner'

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

  // Subscription state drives a global banner (trial ending / read-only).
  const access = user ? await getClinicAccess(user.clinicId) : null

  return (
    <DashboardShell
      user={user ? { firstName: user.firstName, lastName: user.lastName, role: user.role } : null}
    >
      {access && <SubscriptionBanner access={access} />}
      {children}
    </DashboardShell>
  )
}
