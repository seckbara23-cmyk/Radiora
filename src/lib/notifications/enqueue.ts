import 'server-only'

// Phase 4F — enqueue a WhatsApp notification into the outbox.
//
// Called from clinical/billing actions when something notable happens (report
// validated/delivered, etc.). It is BEST-EFFORT: any failure is swallowed so a
// notification problem never blocks the underlying clinical operation (same rule
// as audit logging). No real WhatsApp API is contacted — the row is left
// `pending` for a future delivery worker. The message is PHI-free by
// construction (see buildWhatsAppMessage / sanitizeContext).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  isEventEnabled,
  buildWhatsAppMessage,
  type MessageContext,
} from '@/lib/notifications/whatsapp'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationEvent,
  type NotificationSettings,
} from '@/types/notifications'

export async function enqueueWhatsAppNotification(
  clinicId: string | null,
  event: NotificationEvent,
  context: MessageContext = {},
): Promise<void> {
  if (!clinicId) return
  try {
    const db = createAdminClient()

    const { data } = await db
      .from('notification_settings')
      .select('whatsapp_enabled, whatsapp_number, on_report_validated, on_report_delivered, on_appointment_reminder, on_critical_finding')
      .eq('clinic_id', clinicId)
      .maybeSingle()

    const row = data as Record<string, unknown> | null
    const settings: NotificationSettings = row
      ? {
          clinicId,
          whatsappEnabled: Boolean(row.whatsapp_enabled),
          whatsappNumber: (row.whatsapp_number as string | null) ?? null,
          onReportValidated: Boolean(row.on_report_validated),
          onReportDelivered: Boolean(row.on_report_delivered),
          onAppointmentReminder: Boolean(row.on_appointment_reminder),
          onCriticalFinding: Boolean(row.on_critical_finding),
        }
      : { clinicId, ...DEFAULT_NOTIFICATION_SETTINGS }

    if (!isEventEnabled(settings, event)) return

    const { title, body } = buildWhatsAppMessage(event, context)
    await db.from('notifications').insert({
      clinic_id: clinicId,
      type: event,
      channel: 'whatsapp',
      status: 'pending',
      title,
      body,
      payload: { to: settings.whatsappNumber, reference: context.reference ?? null },
    })
  } catch {
    // Notification failures must never block the clinical operation.
  }
}
