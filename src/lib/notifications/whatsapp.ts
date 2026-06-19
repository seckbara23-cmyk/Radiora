// Phase 4F — pure WhatsApp message templating + event gating.
//
// SAFETY: WhatsApp travels over an external channel, so a message must NEVER
// contain clinical content — no findings, impressions, measurements, or
// diagnoses. Templates accept only LOW-PHI context (clinic name, a reference
// number, an appointment date, an optional patient first name) and emit short
// French notices that tell the recipient something is ready / due, never WHAT it
// says. `sanitizeContext` strips anything not on the allow-list before building.

import {
  type NotificationEvent,
  type NotificationSettings,
} from '@/types/notifications'

export interface MessageContext {
  clinicName?: string
  reference?: string // e.g. report/accession number — an identifier, not content
  patientName?: string // first name only, optional
  appointmentDate?: string // 'YYYY-MM-DD'
}

// Only these keys ever reach a template. Defends against a caller accidentally
// threading clinical text through the context object.
const ALLOWED_KEYS: (keyof MessageContext)[] = [
  'clinicName',
  'reference',
  'patientName',
  'appointmentDate',
]

export function sanitizeContext(ctx: MessageContext): MessageContext {
  const clean: MessageContext = {}
  for (const key of ALLOWED_KEYS) {
    const value = ctx[key]
    if (typeof value === 'string' && value.trim()) {
      // Collapse whitespace and cap length so no long free-text rides along.
      clean[key] = value.trim().replace(/\s+/g, ' ').slice(0, 80)
    }
  }
  return clean
}

// Map an event to the clinic toggle that governs it.
export function isEventEnabled(settings: NotificationSettings, event: NotificationEvent): boolean {
  if (!settings.whatsappEnabled) return false
  switch (event) {
    case 'report_validated':
      return settings.onReportValidated
    case 'report_delivered':
      return settings.onReportDelivered
    case 'appointment_reminder':
      return settings.onAppointmentReminder
    case 'critical_finding':
      return settings.onCriticalFinding
  }
}

// Build the (PHI-free) message body for an event. Returns title + body.
export function buildWhatsAppMessage(
  event: NotificationEvent,
  rawCtx: MessageContext,
): { title: string; body: string } {
  const ctx = sanitizeContext(rawCtx)
  const who = ctx.patientName ? ` ${ctx.patientName}` : ''
  const clinic = ctx.clinicName ?? 'votre centre d’imagerie'
  const ref = ctx.reference ? ` (réf. ${ctx.reference})` : ''

  switch (event) {
    case 'report_validated':
      return {
        title: 'Compte rendu validé',
        body: `Bonjour${who}, votre compte rendu${ref} a été validé par le radiologue de ${clinic}. Il sera transmis prochainement.`,
      }
    case 'report_delivered':
      return {
        title: 'Compte rendu disponible',
        body: `Bonjour${who}, votre compte rendu${ref} est disponible. Contactez ${clinic} pour y accéder de façon sécurisée.`,
      }
    case 'appointment_reminder':
      return {
        title: 'Rappel de rendez-vous',
        body: `Bonjour${who}, rappel de votre rendez-vous d’imagerie à ${clinic}${ctx.appointmentDate ? ` le ${ctx.appointmentDate}` : ''}.`,
      }
    case 'critical_finding':
      return {
        title: 'Résultat à examiner rapidement',
        body: `Un compte rendu${ref} de ${clinic} nécessite une attention rapide du médecin référent. Merci de consulter la plateforme.`,
      }
  }
}
