// R2.1 — the canonical New Report entry.
//
// This is the ONE route every "New Report" action points at. It is deliberately
// a thin entry shell, not the R2 workspace: it names the workflow the doctor is
// about to run, then hands off to the EXISTING creation path.
//
// REUSE, NOT DUPLICATION. No patient, study or report creation logic lives
// here. It lists examinations that have no report yet (getStudies, read-only)
// and submits to `createReport` — the same server action the study page has
// always used, with the same role gate, billing gate and RLS. Reports require
// both study_id and patient_id NOT NULL, so an examination must exist first;
// that constraint is why this is a picker rather than a blank form.
//
// R2.2/R2.3 replace step 2 onward with the unified dictation workspace. The
// creation call stays exactly as it is.

import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getStudies } from '@/lib/data/studies'
import { getPatients } from '@/lib/data/patients'
import { createReport } from '@/lib/actions/reports'
import { EmptyState } from '@/components/ui/empty-state'
import { LANDING_ROUTE } from '@/config/product-scope'
import type { UserRole } from '@/types/user'

const CREATE_ROLES: UserRole[] = ['super_admin', 'clinic_admin', 'radiologist']

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'newReport' })
  return { title: t('title') }
}

export default async function NewReportPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('newReport')
  const user = await requireCurrentUser()
  const canCreate = CREATE_ROLES.includes(user.role)

  // Read-only: examinations with no report yet, plus their patients.
  const studies = canCreate ? await getStudies() : []
  const pending = studies.filter((s) => !s.hasReport).slice(0, 25)
  const patients = pending.length ? await getPatients() : []
  const patientById = new Map(patients.map((p) => [p.id, p]))

  // Bound to the same action the study page uses — no new creation logic.
  const createReportAction = createReport.bind(null, { error: null }) as unknown as (
    formData: FormData,
  ) => Promise<void>

  const steps = [
    t('step1'),
    t('step2'),
    t('step3'),
    t('step4'),
    t('step5'),
    t('step6'),
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={LANDING_ROUTE as '/reports'} className="text-sm text-gray-500 transition hover:text-gray-700">
          ← {t('back')}
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      {/* The workflow this route opens. Steps 2-6 are built in R2.2+. */}
      <ol className="grid gap-2 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2.5 text-sm text-gray-600">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i + 1}
            </span>
            <span className={i === 0 ? 'font-medium text-gray-900' : ''}>{label}</span>
          </li>
        ))}
      </ol>

      {!canCreate ? (
        <EmptyState title={t('noPermission')} description={t('noPermissionDesc')} />
      ) : pending.length === 0 ? (
        <EmptyState title={t('noExams')} description={t('noExamsDesc')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">{t('selectExam')}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t('selectExamDesc')}</p>
          </div>
          <ul className="divide-y divide-gray-50">
            {pending.map((s) => {
              const p = patientById.get(s.patientId)
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {p ? `${p.lastName.toUpperCase()} ${p.firstName}` : '—'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                        {s.modality}
                      </span>
                      <span>{s.bodyPart}</span>
                      <span className="text-gray-300">·</span>
                      <span>{s.studyDate}</span>
                    </p>
                  </div>
                  <form action={createReportAction} className="shrink-0">
                    <input type="hidden" name="study_id" value={s.id} />
                    <input type="hidden" name="patient_id" value={s.patientId} />
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      {t('start')}
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
