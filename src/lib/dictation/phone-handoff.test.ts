import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { reportOwner, vacationItemOwner, ownerFromRow, ownerAuditMetadata } from '@/lib/dictation/owner'
import { isReportContentLocked } from '@/lib/safety/immutability'
import { PAIRING_TTL_MINUTES } from '@/types/dictation'

// R2.7 — the guarantees that keep the phone a microphone for ONE report.
// The token path runs against Supabase, so these assert the guards at their
// source rather than mocking a database into agreeing with itself.

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const ACTIONS = read('lib/actions/dictation.ts')
const CODE = strip(ACTIONS)
const fn = (name: string) => {
  const start = CODE.indexOf(`export async function ${name}`)
  if (start < 0) throw new Error(`${name} not found`)
  const next = CODE.indexOf('\nexport ', start + 10)
  return CODE.slice(start, next < 0 ? undefined : next)
}

const UPLOAD    = fn('uploadFromMobile')
const CONNECTED = fn('markDeviceConnected')
const RECORDING = fn('markDeviceRecording')
const STATUS    = fn('getDictationSessionStatus')
const ACTIVE    = fn('getActiveReportDictationSession')
const MOBILE_PAGE     = read('app/[locale]/m/[token]/page.tsx')
const MOBILE_RECORDER = read('app/[locale]/m/[token]/MobileRecorder.tsx')
const CONTEXT         = read('lib/data/dictation.ts')

describe('1-2. the session belongs to exactly one owner', () => {
  it('a report session carries the report and nothing else', () => {
    const owner = reportOwner('r-1')
    expect(owner).toEqual({ kind: 'report', reportId: 'r-1' })
    expect(ownerFromRow({ report_id: 'r-1', vacation_item_id: null })).toEqual(owner)
  })

  it('3. the phone never says where the audio belongs — the token does', () => {
    // The owner is read from the SESSION ROW, never from the upload payload.
    expect(UPLOAD).toContain('ownerFromRow(session')
    expect(UPLOAD).not.toMatch(/formData\.get\(\s*['"](reportId|report_id|itemId|owner)['"]\s*\)/)
  })

  it('a session with neither owner is refused rather than guessed at', () => {
    expect(ownerFromRow({ report_id: null, vacation_item_id: null })).toBeNull()
    expect(UPLOAD).toContain('if (!owner) return')
  })

  it('a queue session is unaffected by the report path', () => {
    expect(ownerFromRow({ vacation_item_id: 'v-1', report_id: null }))
      .toEqual(vacationItemOwner('v-1'))
  })
})

describe('4. clinic binding', () => {
  it('the linked report must belong to the session clinic', () => {
    expect(UPLOAD).toMatch(/report\.clinic_id as string\) !== clinicId/)
  })

  it('the clinic comes from the session row, never from the phone', () => {
    expect(UPLOAD).toContain('const clinicId   = session.clinic_id as string')
    expect(UPLOAD).not.toMatch(/formData\.get\(\s*['"]clinic/i)
  })
})

describe('5-6. expiry and revocation', () => {
  it('every phone entry point enforces the TTL', () => {
    for (const [name, body] of Object.entries({ UPLOAD, CONNECTED, RECORDING })) {
      expect(body, name).toMatch(/isSessionExpired|expires_at as string\).getTime\(\) < Date\.now\(\)/)
    }
  })

  it('every phone entry point refuses a terminal session', () => {
    for (const [name, body] of Object.entries({ UPLOAD, CONNECTED, RECORDING })) {
      expect(body, name).toMatch(/isTerminalSessionStatus|\['completed', 'cancelled', 'expired'\]/)
    }
  })

  it('the desktop status read resolves expiry and reports terminality', () => {
    expect(STATUS).toContain('effectiveSessionStatus')
    expect(STATUS).toContain('terminal:    isTerminalSessionStatus(status)')
  })

  it('the TTL is short-lived', () => {
    expect(PAIRING_TTL_MINUTES).toBeLessThanOrEqual(60)
    expect(PAIRING_TTL_MINUTES).toBeGreaterThan(0)
  })
})

describe('7-9. one session, one recording', () => {
  it('7. the session is claimed atomically before any side effect', () => {
    const claim = UPLOAD.indexOf(".in('status', ['pending', 'connected', 'recording'])")
    const transcripts = UPLOAD.indexOf("from('transcriptions')")
    expect(claim).toBeGreaterThan(-1)
    // The compare-and-set happens BEFORE the transcript writes, so a duplicate
    // can never perform them twice.
    expect(claim).toBeLessThan(transcripts)
  })

  it('9. the loser of a race deletes its own asset and storage object', () => {
    const loser = UPLOAD.slice(UPLOAD.indexOf('if (!claimed || claimed.length === 0)'))
    expect(loser).toContain("from('audio_assets').delete()")
    expect(loser).toContain('storage.from(AUDIO_BUCKET).remove([path])')
  })

  it('the claim only ever moves a LIVE session to completed', () => {
    expect(UPLOAD).toMatch(/status: 'completed'[\s\S]{0,220}\.in\('status', \['pending', 'connected', 'recording'\]\)/)
  })

  it('8. a failed upload leaves the session usable for a retry', () => {
    // Storage/asset failures return before the claim, so status is untouched
    // and the doctor can send the same recording again.
    const beforeClaim = UPLOAD.slice(0, UPLOAD.indexOf('CLAIM') > -1 ? UPLOAD.indexOf('const { data: claimed') : UPLOAD.length)
    expect(beforeClaim).toContain('if (uploadError) return')
    expect(MOBILE_RECORDER).toContain("setPhase('review')")
  })

  it('the phone will not start a second upload while one is in flight', () => {
    expect(MOBILE_RECORDER).toContain('if (sendingRef.current) return')
    expect(MOBILE_RECORDER).toContain('sendingRef.current = true')
    expect(MOBILE_RECORDER).toContain('sendingRef.current = false')
  })
})

describe('18-19. the phone sees an examination, not a patient file', () => {
  it('no report content of any kind reaches the phone', () => {
    for (const forbidden of [
      'findings', 'impression', 'conclusion', 'structured_data', 'results',
      'recommendations', 'signature', 'signed_at',
    ]) {
      expect(MOBILE_PAGE, forbidden).not.toContain(forbidden)
      expect(MOBILE_RECORDER, forbidden).not.toContain(forbidden)
    }
  })

  it('a report session sends no patient name', () => {
    const reportBranch = CONTEXT.slice(CONTEXT.indexOf('if (session.report_id)'))
    expect(reportBranch).not.toContain('first_name')
    expect(reportBranch).not.toContain('last_name')
  })

  it('the phone page selects only exam-identifying columns', () => {
    expect(CONTEXT).toContain("select('exam_type, study_id')")
    expect(CONTEXT).toContain("select('modality, accession_number')")
  })

  it('the mobile route is not indexable', () => {
    expect(MOBILE_PAGE).toContain('robots: { index: false, follow: false }')
  })
})

describe('20-21. the recording lands on the report', () => {
  it('the audio asset is written with the session owner', () => {
    expect(UPLOAD).toContain('...audioOwnerColumns(owner)')
  })

  it('the transcript row is discoverable by report id', () => {
    expect(UPLOAD).toContain(".eq('report_id', owner.reportId)")
    expect(UPLOAD).toContain('...ownerColumns(owner)')
  })

  it('a signed report accepts no new audio, even mid-session', () => {
    expect(UPLOAD).toContain('isReportContentLocked(report.status as string)')
    expect(isReportContentLocked('finalized')).toBe(true)
    expect(isReportContentLocked('draft')).toBe(false)
  })
})

describe('27-29. more than one dictation pass', () => {
  it('27. each pass mints its own session', () => {
    // createReportDictationSession always inserts; nothing reuses a token.
    const create = CODE.slice(CODE.indexOf('async function createSessionForOwner'))
    expect(create).toContain("from('dictation_sessions')")
    expect(create).toContain('.insert(')
    expect(create).not.toContain('.upsert(')
  })

  it('28. a second pass updates the transcript row rather than deleting it', () => {
    const reportBranch = UPLOAD.slice(UPLOAD.indexOf("} else {"))
    expect(reportBranch).toContain("update({ audio_asset_id: assetId })")
    expect(reportBranch).not.toContain('.delete()')
  })

  it('29. a finalized report cannot start a new phone session', () => {
    const create = CODE.slice(CODE.indexOf('async function createSessionForOwner'))
    expect(create).toContain('isReportContentLocked(report.status as string)')
  })
})

describe('30. privacy of the audit trail', () => {
  it('no audit call carries the token', () => {
    const audits = [...CODE.matchAll(/logAudit\(\{[\s\S]*?\}\)/g)].map((m) => m[0])
    expect(audits.length).toBeGreaterThan(0)
    for (const a of audits) {
      expect(a).not.toContain('token')
      expect(a).not.toContain('url')
    }
  })

  it('the mobile upload audit records provenance, not content', () => {
    const insert = UPLOAD.slice(UPLOAD.indexOf("from('audit_logs')"))
    expect(insert).toContain('ownerAuditMetadata(owner)')
    expect(insert).toContain('sizeBytes')
    for (const forbidden of ['token', 'raw_text', 'transcript', 'patient']) {
      expect(insert, forbidden).not.toContain(forbidden)
    }
  })

  it('owner audit metadata is ids and kind only', () => {
    const meta = ownerAuditMetadata(reportOwner('r-1'))
    const serialised = JSON.stringify(meta)
    expect(serialised).toContain('r-1')
    expect(serialised).not.toMatch(/token|name|transcript/i)
  })

  it('the token never appears in a returned field', () => {
    // getActiveReportDictationSession regenerates the QR from the token but
    // never returns the token itself.
    expect(ACTIVE).toContain('qrSvg')
    expect(ACTIVE).not.toMatch(/return \{[^}]*token/)
  })
})

describe('the desktop drives the R2.3 machine, not a copy of it', () => {
  const WORKSPACE = read('app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx')

  it('17. polling stops on unmount and after a terminal status', () => {
    expect(WORKSPACE).toContain('return () => { alive = false; clearInterval(id) }')
    expect(WORKSPACE).toMatch(/if \(res\.terminal\) \{\s*clearInterval\(id\)/)
  })

  it('16. polling only runs while the handoff is live', () => {
    expect(WORKSPACE).toContain('if (!qr || !isLiveStage(stage)) return')
  })

  it('status is turned into a workspace EVENT, never a state assignment', () => {
    expect(WORKSPACE).toContain('workspaceEventForStatus')
    expect(WORKSPACE).toContain('setState((s) => workspaceReducer(s, event))')
  })

  it('the panel shows no internal identifier', () => {
    // Code, not prose: the panel's own comment explains which words it avoids.
    const PANEL = strip(read('app/[locale]/(dashboard)/reports/[id]/PhoneHandoffPanel.tsx'))
    for (const forbidden of ['sessionId', 'token', 'clinic_id', 'audio_asset_id', 'pending']) {
      expect(PANEL, forbidden).not.toContain(forbidden)
    }
  })
})
