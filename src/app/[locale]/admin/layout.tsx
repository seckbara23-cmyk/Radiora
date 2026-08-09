import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireSuperAdmin } from '@/lib/auth/get-current-user'
import { AdminNav } from './AdminNav'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  // Hard gate: only platform admins (super_admin) may enter the portal.
  const user = await requireSuperAdmin()
  const t = await getTranslations('admin')

  const navItems = [
    { href: '/admin', label: t('nav.overview') },
    { href: '/admin/clinics', label: t('nav.clinics') },
    { href: '/admin/customers', label: t('nav.customers') },
    { href: '/admin/billing', label: t('nav.billing') },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">Radiora</span>
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {t('portalBadge')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-gray-500 sm:inline">
                {user.firstName} {user.lastName}
              </span>
              <Link href="/reports" className="text-blue-600 hover:text-blue-700">
                {t('backToApp')}
              </Link>
            </div>
          </div>
          <div className="pb-3">
            <AdminNav items={navItems} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">{children}</main>
    </div>
  )
}
