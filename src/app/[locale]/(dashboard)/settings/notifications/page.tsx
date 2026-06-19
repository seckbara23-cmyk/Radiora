import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { getNotificationSettings } from '@/lib/data/notification-settings'
import { getClinicSubscription } from '@/lib/data/billing'
import { NotificationSettingsForm } from './NotificationSettingsForm'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'notificationSettings' })
  return { title: t('title') }
}

export default async function NotificationSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('notificationSettings')
  const user = await requireCurrentUser()

  // Only the clinic admin (or platform admin) configures clinic notifications.
  if (user.role !== 'clinic_admin' && user.role !== 'super_admin') {
    redirect(`/${locale}/settings`)
  }
  if (!user.clinicId) redirect(`/${locale}/settings`)

  const [settings, subscription] = await Promise.all([
    getNotificationSettings(user.clinicId!),
    getClinicSubscription(user.clinicId!),
  ])

  // WhatsApp is a Professional/Enterprise feature; surface a note on Starter.
  const isStarter = subscription?.planId === 'starter'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      {isStarter && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('planNotice')}
        </p>
      )}

      <NotificationSettingsForm
        settings={settings}
        labels={{
          enable: t('enable'),
          enableHint: t('enableHint'),
          number: t('number'),
          numberPlaceholder: t('numberPlaceholder'),
          events: t('events'),
          reportValidated: t('reportValidated'),
          reportDelivered: t('reportDelivered'),
          appointmentReminder: t('appointmentReminder'),
          criticalFinding: t('criticalFinding'),
          save: t('save'),
          saving: t('saving'),
          saved: t('saved'),
          phiNote: t('phiNote'),
        }}
      />
    </div>
  )
}
