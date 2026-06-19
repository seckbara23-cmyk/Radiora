import { describe, it, expect } from 'vitest'
import { sanitizeContext, isEventEnabled, buildWhatsAppMessage } from './whatsapp'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  NOTIFICATION_EVENTS,
} from '@/types/notifications'

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { clinicId: 'c1', ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides }
}

describe('sanitizeContext', () => {
  it('keeps only allow-listed keys', () => {
    // Clinical fields are intentionally present here — sanitizeContext must drop them.
    const dirty: Record<string, string> = {
      clinicName: 'Centre Dakar',
      reference: 'ACC-1',
      findings: 'masse suspecte lobe supérieur droit',
      impression: 'cancer probable',
    }
    const clean = sanitizeContext(dirty)
    expect(clean).toEqual({ clinicName: 'Centre Dakar', reference: 'ACC-1' })
    expect(JSON.stringify(clean)).not.toContain('masse')
    expect(JSON.stringify(clean)).not.toContain('cancer')
  })

  it('collapses whitespace and caps length', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeContext({ reference: long }).reference).toHaveLength(80)
    expect(sanitizeContext({ clinicName: '  Centre   Dakar ' }).clinicName).toBe('Centre Dakar')
  })
})

describe('isEventEnabled', () => {
  it('is false whenever WhatsApp is disabled, regardless of toggles', () => {
    const s = settings({ whatsappEnabled: false, onReportValidated: true })
    expect(isEventEnabled(s, 'report_validated')).toBe(false)
  })

  it('respects per-event toggles when enabled', () => {
    const s = settings({ whatsappEnabled: true, onReportValidated: true, onAppointmentReminder: false })
    expect(isEventEnabled(s, 'report_validated')).toBe(true)
    expect(isEventEnabled(s, 'appointment_reminder')).toBe(false)
  })
})

describe('buildWhatsAppMessage', () => {
  it('produces a message for every event with no clinical content', () => {
    for (const event of NOTIFICATION_EVENTS) {
      const { title, body } = buildWhatsAppMessage(event, {
        clinicName: 'Centre Dakar',
        reference: 'ACC-2026-1',
        patientName: 'Awa',
      })
      expect(title.length).toBeGreaterThan(0)
      expect(body.length).toBeGreaterThan(0)
      expect(body).toContain('Centre Dakar')
    }
  })

  it('never leaks clinical text even if it sneaks into context', () => {
    const { body } = buildWhatsAppMessage('report_validated', {
      clinicName: 'Centre Dakar',
      // @ts-expect-error — should be stripped by sanitizeContext
      findings: 'nodule pulmonaire',
    })
    expect(body).not.toContain('nodule')
  })

  it('includes the appointment date when provided', () => {
    const { body } = buildWhatsAppMessage('appointment_reminder', {
      clinicName: 'Centre Dakar',
      appointmentDate: '2026-07-01',
    })
    expect(body).toContain('2026-07-01')
  })
})
