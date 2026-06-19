// Phase 4A — global subscription banner.
//
// Rendered at the top of the dashboard. Shows nothing when the subscription is
// healthy; a warning strip when a trial/grace period is ending soon; and a
// read-only strip when the clinic has lapsed (trial expired / suspended /
// cancelled). Purely presentational server component.

import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { shouldWarnExpiry, type ClinicAccess } from '@/lib/billing/subscription'

export async function SubscriptionBanner({ access }: { access: ClinicAccess }) {
  const t = await getTranslations('billing')

  if (access.readOnly) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800">
        <span>
          <strong className="font-semibold">{t('banner.readOnlyTitle')}</strong> ·{' '}
          {t('banner.readOnlyBody')}
        </span>
        <Link
          href="/settings/billing"
          className="shrink-0 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          {t('banner.cta')}
        </Link>
      </div>
    )
  }

  if (shouldWarnExpiry(access)) {
    const days = access.daysLeft ?? 0
    const label =
      access.state === 'trialing'
        ? t('banner.trialEnding', { days })
        : t('banner.graceEnding', { days })
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-800">
        <span>{label}</span>
        <Link
          href="/settings/billing"
          className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
        >
          {t('banner.cta')}
        </Link>
      </div>
    )
  }

  return null
}
