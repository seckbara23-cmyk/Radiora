import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getPilotReport } from '@/lib/data/pilot'
import { Badge } from '@/components/ui/badge'
import type { FeedbackCategory, FeedbackPriority } from '@/types/pilot'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pilot' })
  return { title: t('title') }
}

const PRIORITY_VARIANT: Record<FeedbackPriority, 'danger' | 'warning' | 'neutral'> = {
  critical: 'danger',
  important: 'warning',
  nice_to_have: 'neutral',
}

export default async function PilotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireCurrentUser()
  if (!['clinic_admin', 'super_admin'].includes(user.role)) redirect(`/${locale}/dashboard`)

  const t = await getTranslations('pilot')
  const { metrics, commonIssues, recommendations } = await getPilotReport(30)
  const { kpis, session, feedback } = metrics

  const kpiCards = [
    { label: t('kpi.reportsCompleted'), value: String(kpis.reportsCompleted) },
    { label: t('kpi.avgDictation'),     value: t('unit.min', { n: session.dictationMinutes }) },
    { label: t('kpi.avgValidation'),    value: t('unit.min', { n: kpis.avgValidationMinutes }) },
    { label: t('kpi.avgCorrections'),   value: String(kpis.avgCorrections) },
    { label: t('kpi.exportCount'),      value: String(kpis.exportCount) },
    { label: t('kpi.secureDelivery'),   value: String(kpis.secureDeliveryCount) },
  ]

  const conf = kpis.confidence
  const confRows: Array<{ key: 'high' | 'medium' | 'low'; color: string }> = [
    { key: 'high',   color: 'bg-emerald-500' },
    { key: 'medium', color: 'bg-amber-500' },
    { key: 'low',    color: 'bg-red-500' },
  ]

  const card = 'rounded-xl border border-gray-200 bg-white p-5'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-gray-400">{t('rangeNote', { days: metrics.dayRange })}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((c) => (
          <div key={c.label} className={card}>
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Confidence distribution */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-900">{t('confidence.title')}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{t('confidence.subtitle')}</p>
        {conf.total === 0 ? (
          <p className="mt-3 text-sm text-gray-400">{t('confidence.empty')}</p>
        ) : (
          <div className="mt-4 space-y-2">
            {confRows.map((r) => {
              const n = conf[r.key]
              const pct = Math.round((n / conf.total) * 100)
              return (
                <div key={r.key} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-gray-600">{t(`confidence.${r.key}`)}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full ${r.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-gray-700">{n} · {pct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Session analytics */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-900">{t('session.title')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">{t('session.stepDictation')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{t('unit.min', { n: session.dictationMinutes })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t('session.stepValidation')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{t('unit.min', { n: session.validationMinutes })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t('session.stepTurnaround')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{t('unit.min', { n: session.turnaroundMinutes })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t('session.completion')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{session.completionRatePct}%</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">{t('session.method')}</p>
            <p className="mt-1 text-sm text-gray-700">
              {t('session.methodMobile')}: <span className="font-semibold">{session.dictationMethod.mobile}</span>
              {' · '}
              {t('session.methodUpload')}: <span className="font-semibold">{session.dictationMethod.upload}</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t('session.topMethod')}: {t(`session.method_${session.dictationMethod.topMethod}`)}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">{t('session.exportUsage')}</p>
            <p className="mt-1 text-sm text-gray-700">
              PDF: <span className="font-semibold">{session.exportUsage.pdf}</span>{' · '}
              Word: <span className="font-semibold">{session.exportUsage.docx}</span>{' · '}
              {t('session.print')}: <span className="font-semibold">{session.exportUsage.print}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Feedback summary */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-900">{t('feedback.title')}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{t('feedback.total', { n: feedback.total })}</p>

        {feedback.total === 0 ? (
          <p className="mt-3 text-sm text-gray-400">{t('feedback.empty')}</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500">{t('feedback.byCategory')}</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {(Object.entries(feedback.byCategory) as Array<[FeedbackCategory, number]>)
                    .filter(([, n]) => n > 0)
                    .map(([cat, n]) => (
                      <li key={cat} className="flex justify-between">
                        <span>{t(`feedback.categories.${cat}`)}</span>
                        <span className="font-semibold">{n}</span>
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{t('feedback.byPriority')}</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {(Object.entries(feedback.byPriority) as Array<[FeedbackPriority, number]>)
                    .filter(([, n]) => n > 0)
                    .map(([pri, n]) => (
                      <li key={pri} className="flex justify-between">
                        <span>{t(`feedback.priorities.${pri}`)}</span>
                        <span className="font-semibold">{n}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            {/* Recent feedback */}
            <div className="mt-5 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500">{t('feedback.recent')}</p>
              <ul className="mt-3 space-y-3">
                {metrics.recentFeedback.map((f) => (
                  <li key={f.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{t(`feedback.categories.${f.category}`)}</Badge>
                      <Badge variant={PRIORITY_VARIANT[f.priority]}>{t(`feedback.priorities.${f.priority}`)}</Badge>
                      <span className="text-xs text-gray-400">{f.createdAt.slice(0, 10)}</span>
                      {f.authorName && <span className="text-xs text-gray-400">· {f.authorName}</span>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{f.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      {/* Pilot report — common issues + recommendations */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-900">{t('report.title')}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{t('report.subtitle')}</p>

        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-gray-500">{t('report.commonIssues')}</p>
            {commonIssues.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">{t('report.noIssues')}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {commonIssues.map((i) => (
                  <li key={i.category} className="flex justify-between">
                    <span>{t(`feedback.categories.${i.category}`)}</span>
                    <span className="font-semibold">{i.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">{t('report.recommendations')}</p>
            <ul className="mt-2 space-y-2">
              {recommendations.map((code) => (
                <li key={code} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-blue-500" aria-hidden>•</span>
                  {t(`report.rec.${code}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-400">
          {t('report.footer', { clinic: metrics.clinicName ?? '—', date: metrics.generatedAt.slice(0, 10) })}
        </p>
      </section>
    </div>
  )
}
