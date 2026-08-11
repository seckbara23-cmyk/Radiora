// R2.7A — transcribing a dictation is the longest server action on this page.
// Next.js applies a page-level maxDuration to every Server Action the page
// hosts, so the budget is declared here rather than being left at the platform
// default, which a several-minute recording would predictably exceed.
//
// This is a CEILING, not a guarantee: it is only honoured on plans that allow
// it, and a recording long enough to outlast it fails with a `timeout`
// category and an explicit retry rather than a hung request. See the R2.7A
// appendix for the measured limits.
export const maxDuration = 300

// ─── R2.9 — the radiologist's workstation ────────────────────────────────────
//
// This page used to be six numbered stages (Canevas · Correction · Validation ·
// Prévisualisation · Export · Archivage) stacked inside a 896px column, plus
// three more panels below them. The dictation/report workstation the product is
// actually built around was "Section 1 of 6", squeezed to less than half the
// width of the screen a radiologist reports on.
//
// It is now ONE surface:
//
//   context strip  →  workstation (dictation | document)  →  state-dependent actions
//
// The six lifecycle steps from the product concept are a LIFECYCLE, not six UI
// pages: the report's stage is a badge in the context strip, and the single
// next action follows from state. Nothing became a wizard.
//
// What moved, and nothing more:
//   • validation blockers  → beside the Sign button (ReviewSummary, live)
//   • preview/export/delivery → one region that appears once signed
//   • version history      → contextual, below the workstation
//   • frozen panels        → removed from the active surface (see below)
//
// No server action, gate, migration, export renderer or R2.7C behaviour was
// touched by this file.

import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReport } from '@/lib/data/reports'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getTemplates } from '@/lib/data/templates'
import { getReportVersions } from '@/lib/data/report-versions'
import { getUserPhrases } from '@/lib/data/preferences'
import { getHospitalHeaders } from '@/lib/data/hospital-headers'
import { getReportSafetyContext } from '@/lib/data/safety'
import { getReportDeliveries } from '@/lib/data/deliveries'
import { canEditClinicalContent, canSignReports } from '@/lib/safety/authority'
import { ageLabel, displayPatientName, frenchSexLabel } from '@/lib/reports/patient-identity'
import { ReportContextHeader } from './ReportContextHeader'
import { ReportEditor } from './ReportEditor'
import { ReportExportActions } from './ReportExportActions'
import { SecureDeliveryPanel } from './SecureDeliveryPanel'
import { SignedActions } from './SignedActions'
import { VersionHistory } from './VersionHistory'

type Props = { params: Promise<{ id: string; locale: string }> }

export default async function ReportPage({ params }: Props) {
  const { id, locale } = await params
  setRequestLocale(locale)
  const user = await requireCurrentUser()

  const t = await getTranslations('reports')

  const report = await getReport(id)
  if (!report) notFound()

  const [study, patient, versions] = await Promise.all([
    getStudy(report.studyId),
    getPatient(report.patientId),
    getReportVersions(id),
  ])

  const [templates, initialPhrases, safetyContext, hospitalHeaders] = await Promise.all([
    getTemplates({ activeOnly: true, modality: study?.modality }),
    getUserPhrases({ examType: report.examType ?? undefined }),
    getReportSafetyContext(id),
    getHospitalHeaders({ activeOnly: true }),
  ])

  // R2.9 — authority comes from lib/safety/authority.ts, not from an inline
  // role array. The page previously rebuilt ['super_admin','clinic_admin',
  // 'radiologist'] by hand three times, which is how the Sign button ended up
  // enabled for clinic admins who can never succeed at using it.
  const canWrite = canEditClinicalContent(user.role)
  const canSign  = canSignReports(user.role)

  const isFinalized = report.status === 'finalized'
  const deliveries  = canWrite && isFinalized ? await getReportDeliveries(id) : []
  const nowISO      = new Date().toISOString()

  return (
    <div className="mx-auto max-w-6xl space-y-6">

      <ReportContextHeader
        status={report.status}
        delivered={deliveries.length > 0}
        patientName={patient ? displayPatientName(patient.lastName, patient.firstName) : ''}
        patientMrn={patient?.mrn ?? null}
        modality={study?.modality ?? null}
        bodyPart={study?.bodyPart ?? null}
        studyDate={study?.studyDate ?? null}
      />

      {/* ── The workstation ──
          Dictation and the report document, side by side, at the full width of
          the page. This is the product; everything else on this page supports it. */}
      <ReportEditor
        report={report}
        canWrite={canWrite}
        canAmend={canWrite}
        canSign={canSign}
        templates={templates}
        modality={study?.modality ?? null}
        bodyPart={study?.bodyPart ?? null}
        initialPhrases={initialPhrases}
        // R2.7C(F) — the patient row is the ONLY authority for identity. The
        // editor resolves the report's stored block against this rather than
        // trusting it, so a placeholder written by an earlier structuring run
        // cannot survive.
        patientInfo={{
          name: patient ? displayPatientName(patient.lastName, patient.firstName) : '',
          age:  ageLabel(patient?.dateOfBirth),
          sex:  patient ? frenchSexLabel(patient.sex) : '',
        }}
        examDate={study?.studyDate ?? report.createdAt.slice(0, 10)}
        // R2.3 — the report-owned transcript (R2.2) so a reload reconstructs
        // the dictation relationship, not just the report content.
        initialTranscript={safetyContext?.rawTranscript ?? ''}
        // R2.9 — the signing gate's own inputs, so the editor can show the
        // radiologist the SAME verdict finalizeReport will reach.
        aiConfidence={safetyContext?.aiConfidence ?? null}
        cleanedTranscript={safetyContext?.cleanedTranscript ?? null}
      />

      {/* ── Once signed, this is what the report is for ── */}
      {isFinalized && (
        <SignedActions
          previewHref="print"
          exportActions={
            <ReportExportActions
              reportId={id}
              headers={hospitalHeaders.map((h) => ({ id: h.id, name: h.name }))}
            />
          }
          deliveryPanel={
            canWrite ? (
              <SecureDeliveryPanel
                reportId={id}
                locale={locale}
                headers={hospitalHeaders.map((h) => ({ id: h.id, name: h.name }))}
                deliveries={deliveries}
                nowISO={nowISO}
              />
            ) : undefined
          }
        />
      )}

      {/* ── Correction history — contextual, not a stage of the workflow ── */}
      <section aria-labelledby="history-heading" className="space-y-2">
        <h2 id="history-heading" className="text-sm font-semibold text-gray-700">
          {t('sectionCorrectionTitle')}
        </h2>
        <VersionHistory versions={versions} />
      </section>

      {/*
        R2.9 — the patient-explanation and report-translation panels are NOT
        rendered here any more. product-scope.ts classifies patient_explanations
        and report_translations as FROZEN, yet they were still being composed
        onto the live report page: the registry and the runtime disagreed.
        This removes them from the ACTIVE SURFACE only — their routes, server
        actions, tables, RLS policies and history are all untouched, exactly as
        the R2.1 freeze intends.
      */}
    </div>
  )
}
