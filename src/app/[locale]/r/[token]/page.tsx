// F17 — PUBLIC secure-link landing page: /:locale/r/:token
//
// Unauthenticated. Resolves the delivery via the service-role client (the patient
// has no session), records a report_opened audit event, and — once any password
// gate is satisfied — exposes the frozen PDF/DOCX download. No report content is
// ever rendered here; only the download is offered.

import { setRequestLocale, getTranslations } from 'next-intl/server'
import { resolveDelivery } from '@/lib/delivery/access'
import { DeliveryUnlock } from './DeliveryUnlock'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string; token: string }> }

export default async function SecureDeliveryPage({ params }: Props) {
  const { locale, token } = await params
  setRequestLocale(locale)
  const t = await getTranslations('delivery')

  const now = new Date().toISOString()
  const resolved = await resolveDelivery(token, now)

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white text-sm font-bold">
            R
          </span>
          <span className="text-lg font-semibold text-gray-900">Radiora</span>
        </div>

        {!resolved ? (
          <div className="mt-8">
            <h1 className="text-base font-semibold text-gray-900">{t('invalid.title')}</h1>
            <p className="mt-2 text-sm text-gray-500">{t('invalid.body')}</p>
          </div>
        ) : !resolved.openable ? (
          <div className="mt-8">
            <h1 className="text-base font-semibold text-gray-900">{t('unavailable.title')}</h1>
            <p className="mt-2 text-sm text-gray-500">
              {resolved.delivery.revokedAt ? t('unavailable.revoked') : t('unavailable.expired')}
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <h1 className="text-base font-semibold text-gray-900">{t('ready.title')}</h1>
            <p className="mt-2 text-sm text-gray-500">{t('ready.body')}</p>
            <DeliveryUnlock
              token={token}
              requiresPassword={resolved.requiresPassword}
              passwordKind={resolved.passwordKind}
            />
            <p className="mt-6 text-xs text-gray-400">{t('confidentialNote')}</p>
          </div>
        )}
      </div>
    </main>
  )
}
