'use client'

// R2.9 — validation, rendered where the decision is actually made.
//
// THE PROBLEM THIS REPLACES
// The pre-signature safety panel used to be "Section 3 — Validation", a
// separate numbered stage several screens above the Sign button that lived in
// "Section 1". Its own French copy admitted the split: "brouillon, validation
// et signature s'effectuent depuis le canevas ci-dessus." The radiologist read
// the blockers in one place and acted in another.
//
// It also went STALE. As a server component it evaluated the PERSISTED report,
// so typing an indication left it still saying "INDICATION manquante" until a
// save round-tripped.
//
// Both are fixed by moving the evaluation client-side, next to the action:
//
//   • `evaluateSigningReadiness` and `analyzeClinicalSafety` are PURE (no
//     server-only import, no IO, no clock) and `analyzeClinicalSafety` already
//     runs in this browser via buildHpdDraft → the live structuring hook. This
//     is the same code, not a second implementation.
//
//   • `finalizeReport` evaluates the SUBMITTED form content with the same
//     function and the same aiConfidence — so this preview and the server gate
//     agree by construction, not by coincidence. What the doctor sees here is
//     exactly what the server will decide.
//
// This component NEVER changes clinical content. It reads the draft and
// reports on it; every blocker is cleared by the radiologist writing, not by
// anything here.

import { useTranslations } from 'next-intl'
import { evaluateSigningReadiness, type SigningReadiness } from '@/lib/safety/signing-gate'
import { analyzeClinicalSafety } from '@/lib/safety/clinical-warnings'
import { SECTION_LABELS, type SectionKey } from '@/lib/safety/sections'
import type { SectionConfidence } from '@/types/structuring'
import type { StructuredReportData } from '@/types/report'

export interface ReviewContent {
  structuredData: StructuredReportData | null
  findings: string
  impression: string
  recommendations: string | null
}

/** Live signing readiness for the draft on screen. Exported so the editor can
 *  gate its own action on the identical result rather than recomputing. */
export function useSigningReadiness(
  content: ReviewContent,
  aiConfidence: SectionConfidence[] | null,
): SigningReadiness {
  return evaluateSigningReadiness({ ...content, aiConfidence })
}

interface Props {
  content: ReviewContent
  aiConfidence: SectionConfidence[] | null
  rawTranscript: string | null
  cleanedTranscript: string | null
  readiness: SigningReadiness
  /** False for anyone who is not a radiologist — see canSignReports. */
  canSign: boolean
}

export function ReviewSummary({
  content, aiConfidence, rawTranscript, cleanedTranscript, readiness, canSign,
}: Props) {
  const t = useTranslations('safety')

  const warnings = analyzeClinicalSafety({
    ...content,
    aiConfidence,
    rawTranscript,
    cleanedTranscript,
  })

  const sectionLabel = (s?: SectionKey) => (s ? SECTION_LABELS[s] : '')

  // Nothing outstanding and nothing advisory: say so in one line rather than
  // rendering an empty panel.
  if (readiness.canSign && warnings.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-green-700">
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {t('ready')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Blockers — the reason the Sign action is unavailable, stated here so
          the radiologist never has to hunt for it. */}
      {readiness.blockers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v3.5M12 16h.01M10.3 3.9 2.4 17.1A1.9 1.9 0 0 0 4 20h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" />
            </svg>
            {canSign ? t('blockedTitle') : t('title')}
          </p>
          <ul className="mt-1.5 space-y-1">
            {readiness.blockers.map((b, i) => (
              <li key={i} className="text-xs leading-relaxed text-red-700">
                • {t(`blocker.${b.type}` as Parameters<typeof t>[0], { section: b.label })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Advisory only. These never block a signature and never alter content. */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs font-semibold text-amber-900">{t('warningsTitle')}</p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-amber-800">
                • {t(`warning.${w.type}` as Parameters<typeof t>[0], {
                  detail:  w.detail ?? '',
                  section: sectionLabel(w.section),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-gray-400">{t('disclaimer')}</p>
    </div>
  )
}
