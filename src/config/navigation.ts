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
}

export interface NavGroup {
  title?: string   // section heading — omit for the primary group
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
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Clinics', href: '/admin/clinics', icon: 'clinics' },
      { label: 'Users',   href: '/admin/users',   icon: 'users'   },
    ],
  },
]
