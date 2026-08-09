import { describe, it, expect } from 'vitest'
import {
  canSignReports,
  canValidateReports,
  canExportFinal,
  canEditClinicalContent,
  canManageClinicSettings,
  canDoClericalWork,
  ASSIGNABLE_CLINIC_ROLES,
  isAssignableClinicRole,
} from '@/lib/safety/authority'
import type { UserRole } from '@/types/user'

// F10 #5 — role-based clinical authority. The radiologist is the ONLY signer.

const ALL_ROLES: UserRole[] = [
  'super_admin', 'clinic_admin', 'radiologist', 'secretary',
  'technician', 'referring_physician', 'viewer',
]

describe('signing authority', () => {
  it('only a radiologist can validate and sign', () => {
    expect(canSignReports('radiologist')).toBe(true)
    for (const role of ALL_ROLES.filter((r) => r !== 'radiologist')) {
      expect(canSignReports(role)).toBe(false)
    }
  })

  it('a secretary can NEVER validate or sign', () => {
    expect(canSignReports('secretary')).toBe(false)
    expect(canValidateReports('secretary')).toBe(false)
    expect(canExportFinal('secretary')).toBe(false)
  })

  it('clinic_admin and super_admin cannot sign by default', () => {
    expect(canSignReports('clinic_admin')).toBe(false)
    expect(canSignReports('super_admin')).toBe(false)
  })

  it('validation and final export share signing authority', () => {
    for (const role of ALL_ROLES) {
      expect(canValidateReports(role)).toBe(canSignReports(role))
      expect(canExportFinal(role)).toBe(canSignReports(role))
    }
  })

  it('clinical editing is broader than signing (admins may correct drafts)', () => {
    expect(canEditClinicalContent('clinic_admin')).toBe(true)
    expect(canEditClinicalContent('super_admin')).toBe(true)
    expect(canEditClinicalContent('radiologist')).toBe(true)
    expect(canEditClinicalContent('secretary')).toBe(false)
  })

  it('clerical work includes the secretary but not signing', () => {
    expect(canDoClericalWork('secretary')).toBe(true)
    expect(canManageClinicSettings('secretary')).toBe(false)
  })
})

// R0.7 — 'secretary' was added to the user_role enum in migration 016 but never
// to the invite allowlist, so a clinic literally could not create the role the
// dictation workflow is built around.
describe('assignable clinic roles', () => {
  it('includes secretary — the dictation workflow depends on it', () => {
    expect(ASSIGNABLE_CLINIC_ROLES).toContain('secretary')
    expect(isAssignableClinicRole('secretary')).toBe(true)
  })

  it('never lets a clinic_admin mint platform-level access', () => {
    expect(ASSIGNABLE_CLINIC_ROLES).not.toContain('super_admin')
    expect(isAssignableClinicRole('super_admin')).toBe(false)
  })

  it('covers every clinic-level role the product uses', () => {
    for (const role of ['clinic_admin', 'radiologist', 'secretary', 'technician', 'viewer'] as UserRole[]) {
      expect(isAssignableClinicRole(role)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isAssignableClinicRole('administrator')).toBe(false)
    expect(isAssignableClinicRole('')).toBe(false)
  })
})
