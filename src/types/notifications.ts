// Phase 4F — WhatsApp notification settings + events.

// The four clinic-configurable events that can trigger a WhatsApp notification.
export type NotificationEvent =
  | 'report_validated'
  | 'report_delivered'
  | 'appointment_reminder'
  | 'critical_finding'

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  'report_validated',
  'report_delivered',
  'appointment_reminder',
  'critical_finding',
]

export interface NotificationSettings {
  clinicId: string
  whatsappEnabled: boolean
  whatsappNumber: string | null
  onReportValidated: boolean
  onReportDelivered: boolean
  onAppointmentReminder: boolean
  onCriticalFinding: boolean
}

// Safe defaults used when a clinic has no settings row yet.
export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettings, 'clinicId'> = {
  whatsappEnabled: false,
  whatsappNumber: null,
  onReportValidated: true,
  onReportDelivered: true,
  onAppointmentReminder: false,
  onCriticalFinding: true,
}
