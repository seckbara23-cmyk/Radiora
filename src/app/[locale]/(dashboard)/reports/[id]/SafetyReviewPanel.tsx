// Feature 10 — pre-signature safety panel (server component, display-only).
//
// Surfaces the signing gate and clinical warnings to the radiologist before
// validation: a green "ready" banner or a red list of blockers, plus advisory
// warnings (internal inconsistency, low confidence, heavy transcript drift).

import { getTranslations } from 'next-intl/server'
import { evaluateSigningReadiness } from '@/lib/safety/signing-gate'
import { analyzeClinicalSafety } from '@/lib/safety/clinical-warnings'
import { SECTION_LABELS, type SectionKey } from '@/lib/safety/sections'
import type { Report } from '@/types/report'
import type { ReportSafetyContext } from '@/lib/data/safety'

interface Props {
  report: Report
  safety: ReportSafetyContext | null
}

export async function SafetyReviewPanel({ report, safety }: Props) {
  const t = await getTranslations('safety')

  const content = {
    structuredData:  report.structuredData ?? null,
    findings:        report.findings,
    impression:      report.impression,
    recommendations: report.recommendations ?? null,
  }

  const readiness = evaluateSigningReadiness({
    ...content,
    aiConfidence: safety?.aiConfidence ?? null,
  })

  const warnings = analyzeClinicalSafety({
    ...content,
    aiConfidence:      safety?.aiConfidence ?? null,
    rawTranscript:     safety?.rawTranscript ?? null,
    cleanedTranscript: safety?.cleanedTranscript ?? null,
  })

  const sectionLabel = (s?: SectionKey) => (s ? SECTION_LABELS[s] : '')

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">{t('title')}</h2>
      <p className="mt-0.5 text-xs text-gray-500">{t('subtitle')}</p>

      {/* Signing readiness */}
      {readiness.canSign ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          ✓ {t('ready')}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm font-semibold text-red-800">⛔ {t('blockedTitle')}</p>
          <ul className="mt-1.5 space-y-1">
            {readiness.blockers.map((b, i) => (
              <li key={i} className="text-xs text-red-700">
                • {t(`blocker.${b.type}` as Parameters<typeof t>[0], { section: b.label })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Clinical warnings */}
      {warnings.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold text-gray-600">{t('warningsTitle')}</h3>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w, i) => (
              <li
                key={i}
                className={`text-xs ${w.severity === 'high' ? 'text-amber-800' : 'text-amber-700'}`}
              >
                ⚠ {t(`warning.${w.type}` as Parameters<typeof t>[0], {
                  detail:  w.detail ?? '',
                  section: sectionLabel(w.section),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-400">
        {t('disclaimer')}
      </p>
    </section>
  )
}
