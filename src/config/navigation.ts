import type { UserRole } from '@/types/user'

export type IconName =
  | 'dashboard'
  | 'patients'
  | 'studies'
  | 'reports'
  | 'settings'
  | 'clinics'
  | 'users'
  | 'audit'
  | 'templates'
  | 'analytics'
  | 'critical'
  | 'vacations'
  | 'secretary'

export interface NavItem {
  label: string
  href: string
  icon: IconName
  /** If set, only users with one of these roles see this item. */
  roles?: UserRole[]
}

export interface NavGroup {
  title?: string
  /** If set, the entire section is hidden for users not in these roles. */
  roles?: UserRole[]
  items: NavItem[]
}

export const navigation: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
      { label: 'Patients',  href: '/patients',  icon: 'patients'  },
      { label: 'Studies',   href: '/studies',   icon: 'studies'   },
      {
        label: 'Vacation Queue',
        href: '/vacations',
        icon: 'vacations',
        roles: ['clinic_admin', 'radiologist', 'secretary', 'technician', 'super_admin'],
      },
      {
        label: 'Secretary Desk',
        href: '/secretary',
        icon: 'secretary',
        roles: ['clinic_admin', 'secretary', 'super_admin'],
      },
      { label: 'Reports',   href: '/reports',   icon: 'reports'   },
      { label: 'Settings',  href: '/settings',  icon: 'settings'  },
      {
        label: 'Users',
        href: '/users',
        icon: 'users',
        roles: ['clinic_admin', 'super_admin'],
      },
      {
        label: 'Audit History',
        href: '/audit',
        icon: 'audit',
        roles: ['clinic_admin', 'super_admin'],
      },
      {
        label: 'Templates',
        href: '/templates',
        icon: 'templates',
        roles: ['clinic_admin', 'radiologist', 'super_admin'],
      },
      {
        label: 'Analytics',
        href: '/analytics',
        icon: 'analytics',
        roles: ['clinic_admin', 'radiologist', 'super_admin'],
      },
      {
        label: 'Critical Queue',
        href: '/critical-queue',
        icon: 'critical',
        roles: ['clinic_admin', 'radiologist', 'technician', 'super_admin'],
      },
    ],
  },
  {
    title: 'Platform',
    roles: ['super_admin'],
    items: [
      { label: 'Overview', href: '/admin',         icon: 'dashboard' },
      { label: 'Clinics',  href: '/admin/clinics',  icon: 'clinics'   },
      { label: 'Billing',  href: '/admin/billing',  icon: 'analytics' },
    ],
  },
]
