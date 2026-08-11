// R2.9 — what a SIGNED report is for.
//
// Before R2.9 the post-signature actions were scattered down the page as
// numbered stages: preview in "4", export in "5", secure delivery in "6",
// each behind its own heading and explanatory paragraph. A radiologist who had
// just signed had to scroll past a now-disabled editor to reach the only
// things still worth doing.
//
// This is that one region. It appears only once the report is signed, and it
// is where the editing experience recedes to: Aperçu · PDF · Word · Imprimer ·
// Livraison sécurisée.
//
// Server component — it composes the EXISTING export actions and the EXISTING
// secure-delivery panel. No export, delivery, signing or audit behaviour is
// reimplemented or altered here; this only decides where they are rendered.

import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'

interface Props {
  /** The existing ReportExportActions (PDF / Word / Print + letterhead). */
  exportActions: ReactNode
  /** The existing SecureDeliveryPanel, when the viewer may reach it. */
  deliveryPanel?: ReactNode
  /** Relative href of the print/preview view. */
  previewHref: string
}

export async function SignedActions({ exportActions, deliveryPanel, previewHref }: Props) {
  const t = await getTranslations('reports')

  return (
    <section aria-labelledby="signed-actions-heading" className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="signed-actions-heading" className="text-sm font-semibold text-gray-900">
              {t('signedActionsTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">{t('signedActionsDesc')}</p>
          </div>

          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="2.5" strokeWidth={1.6} />
            </svg>
            {t('previewOpen')}
          </a>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">{exportActions}</div>
      </div>

      {deliveryPanel}
    </section>
  )
}
