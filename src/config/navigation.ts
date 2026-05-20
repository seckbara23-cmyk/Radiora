import type { UserRole } from '@/types/user'

export type IconName =
  | 'dashboard'
  | 'patients'
  | 'studies'
  | 'reports'
  | 'settings'
  | 'clinics'
  | 'users'

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
      { label: 'Reports',   href: '/reports',   icon: 'reports'   },
      { label: 'Settings',  href: '/settings',  icon: 'settings'  },
      {
        label: 'Users',
        href: '/users',
        icon: 'users',
        roles: ['clinic_admin', 'super_admin'],
      },
    ],
  },
  {
    title: 'Admin',
    roles: ['super_admin'],
    items: [
      { label: 'Clinics', href: '/admin/clinics', icon: 'clinics' },
      { label: 'Users',   href: '/admin/users',   icon: 'users'   },
    ],
  },
]
