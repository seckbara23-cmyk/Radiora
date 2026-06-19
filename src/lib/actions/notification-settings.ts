'use server'

// Phase 4F — clinic notification settings (WhatsApp) update action.

import { revalidatePath } from 'next/cache'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/actions/audit'

export type NotificationSettingsState = { error: string | null; saved?: boolean }

export async function updateNotificationSettings(
  _prev: NotificationSettingsState,
  formData: FormData,
): Promise<NotificationSettingsState> {
  const user = await requireCurrentUser()
  if (!['clinic_admin', 'super_admin'].includes(user.role)) {
    return { error: 'Seul l’administrateur de la clinique peut modifier ces réglages.' }
  }
  if (!user.clinicId) return { error: 'Aucune clinique associée à votre compte.' }

  const whatsappEnabled = formData.get('whatsapp_enabled') === 'on'
  const whatsappNumber = ((formData.get('whatsapp_number') as string) ?? '').trim() || null

  // A WhatsApp number is required once notifications are switched on.
  if (whatsappEnabled && !whatsappNumber) {
    return { error: 'Veuillez indiquer un numéro WhatsApp pour activer les notifications.' }
  }

  const payload = {
    clinic_id: user.clinicId,
    whatsapp_enabled: whatsappEnabled,
    whatsapp_number: whatsappNumber,
    on_report_validated: formData.get('on_report_validated') === 'on',
    on_report_delivered: formData.get('on_report_delivered') === 'on',
    on_appointment_reminder: formData.get('on_appointment_reminder') === 'on',
    on_critical_finding: formData.get('on_critical_finding') === 'on',
  }

  // RLS on notification_settings confines this upsert to the caller's own clinic.
  const supabase = await createClient()
  const { error } = await supabase
    .from('notification_settings')
    .upsert(payload, { onConflict: 'clinic_id' })

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'notification_settings.updated', entityType: 'clinic', entityId: user.clinicId,
    metadata: { whatsappEnabled },
  })

  revalidatePath('/settings/notifications')
  return { error: null, saved: true }
}
