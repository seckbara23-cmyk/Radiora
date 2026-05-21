import type { ReactNode } from 'react'

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-50  text-green-700  ring-1 ring-inset ring-green-600/20',
  warning: 'bg-amber-50  text-amber-700  ring-1 ring-inset ring-amber-600/20',
  danger:  'bg-red-50    text-red-700    ring-1 ring-inset ring-red-600/20',
  info:    'bg-blue-50   text-blue-700   ring-1 ring-inset ring-blue-600/20',
  neutral: 'bg-gray-100  text-gray-600   ring-1 ring-inset ring-gray-500/20',
  purple:  'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20',
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

import type { StudyStatus, StudyPriority } from '@/types/study'
import type { ReportStatus } from '@/types/report'
import type { PatientStatus } from '@/types/patient'
import type { ClinicStatus } from '@/types/clinic'
import type { UserRole } from '@/types/user'

export const studyStatusVariant: Record<StudyStatus, BadgeVariant> = {
  pending:   'warning',
  in_review: 'info',
  reported:  'purple',
  validated: 'success',
  cancelled: 'neutral',
}


export const studyPriorityVariant: Record<StudyPriority, BadgeVariant> = {
  routine: 'neutral',
  urgent:  'warning',
  stat:    'danger',
}

export const reportStatusVariant: Record<ReportStatus, BadgeVariant> = {
  draft:     'neutral',
  in_review: 'warning',
  finalized: 'success',
  amended:   'purple',
}

export const patientStatusVariant: Record<PatientStatus, BadgeVariant> = {
  active:   'success',
  inactive: 'neutral',
  deceased: 'danger',
}

export const clinicStatusVariant: Record<ClinicStatus, BadgeVariant> = {
  active:    'success',
  trial:     'info',
  suspended: 'danger',
  inactive:  'neutral',
}

export const userRoleLabel: Record<UserRole, string> = {
  super_admin:          'Super Admin',
  clinic_admin:         'Admin',
  radiologist:          'Radiologist',
  technician:           'Technician',
  referring_physician:  'Referring Physician',
  viewer:               'Viewer',
}

export const userRoleVariant: Record<UserRole, BadgeVariant> = {
  super_admin:         'danger',
  clinic_admin:        'purple',
  radiologist:         'info',
  technician:          'neutral',
  referring_physician: 'warning',
  viewer:              'neutral',
}
