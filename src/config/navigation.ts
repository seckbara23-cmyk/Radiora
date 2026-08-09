// R2.1 — primary navigation, derived from the product-scope contract.
//
// A normal radiologist sees exactly three clinical items:
//
//   New Report   ← prominent, the primary action
//   Reports      ← the landing page
//   Templates
//
// Everything the old sidebar carried (Dashboard, Patients, Studies, Vacation
// Queue, Secretary Desk, Analytics, Critical Queue, Audit History, Feedback,
// Pilot, Settings-as-a-clinical-item) is FROZEN in src/config/product-scope.ts:
// the pages, actions, tables and history all still exist, they are simply not
// part of the normal product surface. Nothing was deleted.
//
// Administration is a separate, role-gated group so administrative access never
// reads as clinical capability — and it grants none: signing authority is
// radiologist-only and lives in lib/safety/authority.ts, untouched by this file.

import type { UserRole } from '@/types/user'
import { PRODUCT_SCOPE } from '@/config/product-scope'

export type IconName =
  // CORE
  | 'newReport'
  | 'reports'
  | 'templates'
  // ADMIN_ONLY
  | 'users'
  | 'settings'
  | 'letterhead'
  | 'dashboard'
  | 'clinics'
  | 'analytics'

export interface NavItem {
  label: string
  href: string
  icon: IconName
  /** If set, only users with one of these roles see this item. */
  roles?: UserRole[]
  /** Rendered as the primary call to action rather than a plain link. */
  primary?: boolean
}

export interface NavGroup {
  /** i18n key in the `navigation` namespace. Absent = untitled group.
   *  (Previously the sidebar rendered every titled group as "Administration"
   *  regardless of its title — with two titled groups that is now visible.) */
  titleKey?: 'adminSection' | 'platformSection'
  /** If set, the entire section is hidden for users not in these roles. */
  roles?: UserRole[]
  items: NavItem[]
}

/** Roles that administer a clinic. Not a clinical capability. */
const CLINIC_ADMIN_ROLES: UserRole[] = ['clinic_admin', 'super_admin']

export const navigation: NavGroup[] = [
  {
    items: [
      {
        label: 'New Report',
        href: PRODUCT_SCOPE.new_report.route,
        icon: 'newReport',
        primary: true,
      },
      { label: 'Reports',   href: PRODUCT_SCOPE.reports.route,   icon: 'reports'   },
      {
        label: 'Templates',
        href: PRODUCT_SCOPE.templates.route,
        icon: 'templates',
        roles: ['clinic_admin', 'radiologist', 'super_admin'],
      },
    ],
  },
  {
    titleKey: 'adminSection',
    roles: CLINIC_ADMIN_ROLES,
    items: [
      { label: 'Users',       href: PRODUCT_SCOPE.users.route,       icon: 'users',      roles: CLINIC_ADMIN_ROLES },
      { label: 'Institution', href: PRODUCT_SCOPE.institution.route, icon: 'settings',   roles: CLINIC_ADMIN_ROLES },
      { label: 'Letterhead',  href: PRODUCT_SCOPE.letterhead.route,  icon: 'letterhead', roles: CLINIC_ADMIN_ROLES },
    ],
  },
  {
    titleKey: 'platformSection',
    roles: ['super_admin'],
    items: [
      { label: 'Overview', href: '/admin',         icon: 'dashboard' },
      { label: 'Clinics',  href: '/admin/clinics', icon: 'clinics'   },
      { label: 'Billing',  href: '/admin/billing', icon: 'analytics' },
    ],
  },
]

/**
 * The navigation a given role actually sees. Pure — the sidebar renders this,
 * and the R2.1 tests assert against it.
 */
export function visibleNavigation(role: UserRole | null): NavGroup[] {
  // Fail closed: with no resolved role there is no product surface to show.
  // The sidebar only renders inside the authenticated shell, but a null role
  // means the profile lookup did not resolve — that is not a state in which to
  // start offering clinical actions.
  if (!role) return []
  return navigation
    .filter((group) => !group.roles || (role && group.roles.includes(role)))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
    }))
    .filter((group) => group.items.length > 0)
}

/** Every href a role can reach from the primary navigation. */
export function visibleNavHrefs(role: UserRole | null): string[] {
  return visibleNavigation(role).flatMap((g) => g.items.map((i) => i.href))
}
