// Feature 10 — clinical authority model (single source of truth).
//
// The radiologist is the final medical authority. AI assists with transcription,
// cleanup, structuring and formatting, but only a radiologist may validate and
// sign a report, and only a validated/signed report exports cleanly.
//
// Pure, dependency-light: every server action and UI gate derives its
// permissions here so the rules cannot drift apart across the codebase.

import type { UserRole } from '@/types/user'

/**
 * Who may VALIDATE and SIGN a clinical report.
 *
 * Radiologist only — deliberately. Per the medical-safety policy:
 *   • clinic_admin manages templates/branding/users but must NOT sign unless
 *     they are also a radiologist (roles are single-valued here, so they cannot);
 *   • super_admin has NO clinical override by default.
 * Signing is the act that asserts medical authorship, so it is the narrowest gate.
 */
export function canSignReports(role: UserRole): boolean {
  return role === 'radiologist'
}

/** Validation and signing share the same authority. */
export function canValidateReports(role: UserRole): boolean {
  return canSignReports(role)
}

/**
 * Who may edit a report's clinical content (draft findings/conclusion).
 * Broader than signing so an admin can correct clerical mistakes, but the
 * radiologist remains the one who signs off on the diagnosis.
 */
export function canEditClinicalContent(role: UserRole): boolean {
  return role === 'radiologist' || role === 'clinic_admin' || role === 'super_admin'
}

/** Who may export a *final* (clean, un-watermarked) report — same as signing. */
export function canExportFinal(role: UserRole): boolean {
  return canSignReports(role)
}

/** Clerical queue work: upload audio, match patient, create draft, review transcript. */
export function canDoClericalWork(role: UserRole): boolean {
  return (
    role === 'secretary' ||
    role === 'radiologist' ||
    role === 'clinic_admin' ||
    role === 'super_admin'
  )
}

/** Branding / templates / users administration. */
export function canManageClinicSettings(role: UserRole): boolean {
  return role === 'clinic_admin' || role === 'super_admin'
}

/**
 * Roles a clinic_admin may assign when inviting a colleague.
 *
 * super_admin is excluded deliberately — a clinic administrator must never be
 * able to mint platform-level access. 'secretary' belongs here: it is the role
 * the entire dictation workflow (audio upload → transcript review → hand-off to
 * the radiologist) is built around, and omitting it left clinics unable to
 * provision the staff the product is designed for (R0.7).
 */
export const ASSIGNABLE_CLINIC_ROLES: UserRole[] = [
  'clinic_admin',
  'radiologist',
  'secretary',
  'technician',
  'viewer',
]

export function isAssignableClinicRole(role: string): role is UserRole {
  return (ASSIGNABLE_CLINIC_ROLES as readonly string[]).includes(role)
}
