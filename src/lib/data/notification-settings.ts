import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '@/types/notifications'

function mapRow(row: Record<string, unknown>): NotificationSettings {
  return {
    clinicId: row.clinic_id as string,
    whatsappEnabled: Boolean(row.whatsapp_enabled),
    whatsappNumber: (row.whatsapp_number as string | null) ?? null,
    onReportValidated: Boolean(row.on_report_validated),
    onReportDelivered: Boolean(row.on_report_delivered),
    onAppointmentReminder: Boolean(row.on_appointment_reminder),
    onCriticalFinding: Boolean(row.on_critical_finding),
  }
}

const COLS =
  'clinic_id, whatsapp_enabled, whatsapp_number, on_report_validated, on_report_delivered, on_appointment_reminder, on_critical_finding'

// Returns the clinic's settings, or safe defaults if no row exists yet. RLS
// confines visibility to the clinic's own members (and super_admin).
export async function getNotificationSettings(clinicId: string): Promise<NotificationSettings> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notification_settings')
    .select(COLS)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!data) return { clinicId, ...DEFAULT_NOTIFICATION_SETTINGS }
  return mapRow(data as Record<string, unknown>)
}
