import { describe, it, expect } from 'vitest'
import {
  evaluateQueueTransition,
  canValidateQueueItem,
  CLINICAL_AUTHORITY_STATES,
  POST_SIGN_STATES,
} from '@/lib/safety/workflow-authority'
import type { UserRole } from '@/types/user'
import type { VacationWorkflowStatus } from '@/types/vacation'

// R0.8A — clinical validation and signing belong to the radiologist alone.
// clinic_admin is administrative, super_admin is platform-level; neither carries
// a clinical override, because the queue's "signed" state is what unlocks
// distribution (print / export) of the report.
//
// The database counterpart (migration 042) is proven by
// supabase/verify/R0_8A_clinical_authority.sql, which runs the same attacks
// through direct table updates.

const ALL_ROLES: UserRole[] = [
  'super_admin', 'clinic_admin', 'radiologist', 'technician', 'secretary', 'viewer', 'referring_physician',
]

const validate = (role: UserRole | null | undefined, from: VacationWorkflowStatus = 'radiologist_review') =>
  evaluateQueueTransition({ from, to: 'validated', actorRole: role })

const sign = (role: UserRole | null | undefined, from: VacationWorkflowStatus = 'validated') =>
  evaluateQueueTransition({ from, to: 'signed', actorRole: role })

describe('clinical authority — who may validate or sign', () => {
  it('a radiologist can validate and sign', () => {
    expect(validate('radiologist').allowed).toBe(true)
    expect(sign('radiologist').allowed).toBe(true)
    expect(canValidateQueueItem('radiologist')).toBe(true)
  })

  it('clinic_admin cannot validate or sign — administrative authority only', () => {
    expect(validate('clinic_admin').allowed).toBe(false)
    expect(sign('clinic_admin').allowed).toBe(false)
    expect(validate('clinic_admin').reason).toContain('Only a radiologist')
  })

  it('super_admin cannot validate or sign — no platform clinical override', () => {
    expect(validate('super_admin').allowed).toBe(false)
    expect(sign('super_admin').allowed).toBe(false)
  })

  it('secretary cannot validate or sign', () => {
    expect(validate('secretary').allowed).toBe(false)
    expect(sign('secretary').allowed).toBe(false)
  })

  it('no role other than radiologist may validate or sign', () => {
    for (const role of ALL_ROLES.filter((r) => r !== 'radiologist')) {
      expect(validate(role).allowed, `${role} must not validate`).toBe(false)
      expect(sign(role).allowed, `${role} must not sign`).toBe(false)
    }
  })

  it('a missing or unresolved role fails CLOSED', () => {
    for (const role of [null, undefined, '' as unknown as UserRole]) {
      expect(canValidateQueueItem(role)).toBe(false)
      expect(validate(role).allowed).toBe(false)
      expect(sign(role).allowed).toBe(false)
    }
  })

  it('an unknown role string is not treated as privileged', () => {
    expect(canValidateQueueItem('administrator' as UserRole)).toBe(false)
    expect(validate('chief_radiologist' as UserRole).allowed).toBe(false)
  })
})

describe('validation before distribution', () => {
  it('unsigned → printed is rejected', () => {
    for (const from of ['audio_received', 'transcribing', 'secretary_review', 'radiologist_review', 'validated'] as VacationWorkflowStatus[]) {
      const check = evaluateQueueTransition({ from, to: 'printed', actorRole: 'radiologist' })
      expect(check.allowed, `printing from ${from} must be blocked`).toBe(false)
      expect(check.reason).toContain('signed by a radiologist')
    }
  })

  it('unsigned → exported is rejected', () => {
    for (const from of ['audio_received', 'transcribing', 'secretary_review', 'radiologist_review', 'validated'] as VacationWorkflowStatus[]) {
      const check = evaluateQueueTransition({ from, to: 'exported', actorRole: 'radiologist' })
      expect(check.allowed, `exporting from ${from} must be blocked`).toBe(false)
    }
  })

  it('"validated" alone is NOT enough to distribute — signing is the gate', () => {
    expect(evaluateQueueTransition({ from: 'validated', to: 'printed', actorRole: 'radiologist' }).allowed).toBe(false)
    expect(evaluateQueueTransition({ from: 'validated', to: 'exported', actorRole: 'radiologist' }).allowed).toBe(false)
  })

  it('the full signed → printed → exported chain succeeds', () => {
    expect(evaluateQueueTransition({ from: 'signed',  to: 'printed',  actorRole: 'radiologist' }).allowed).toBe(true)
    expect(evaluateQueueTransition({ from: 'printed', to: 'exported', actorRole: 'radiologist' }).allowed).toBe(true)
    // and signed → exported directly, without an intermediate print
    expect(evaluateQueueTransition({ from: 'signed',  to: 'exported', actorRole: 'radiologist' }).allowed).toBe(true)
  })

  it('distribution is not a clinical act — clerical staff may print an already-signed report', () => {
    // The gate on print/export is the PREDECESSOR state, not the actor's role:
    // once a radiologist has signed, a secretary may run the paperwork.
    expect(evaluateQueueTransition({ from: 'signed', to: 'printed', actorRole: 'secretary' }).allowed).toBe(true)
  })

  it('a missing predecessor (no persisted status) is rejected', () => {
    expect(evaluateQueueTransition({ from: null, to: 'printed', actorRole: 'radiologist' }).allowed).toBe(false)
    expect(evaluateQueueTransition({ from: undefined, to: 'exported', actorRole: 'radiologist' }).allowed).toBe(false)
  })
})

describe('clerical transitions stay open', () => {
  it('moving through the pre-clinical states needs no physician authority', () => {
    for (const to of ['transcribing', 'secretary_review', 'radiologist_review'] as VacationWorkflowStatus[]) {
      expect(evaluateQueueTransition({ from: 'audio_received', to, actorRole: 'secretary' }).allowed).toBe(true)
    }
  })
})

describe('exported state constants', () => {
  it('validated and signed are the clinical-authority states', () => {
    expect(CLINICAL_AUTHORITY_STATES).toEqual(['validated', 'signed'])
  })

  it('printed and exported both count as post-sign predecessors', () => {
    expect(POST_SIGN_STATES).toContain('signed')
    expect(POST_SIGN_STATES).toContain('printed')
    expect(POST_SIGN_STATES).toContain('exported')
    expect(POST_SIGN_STATES).not.toContain('validated')
  })
})
