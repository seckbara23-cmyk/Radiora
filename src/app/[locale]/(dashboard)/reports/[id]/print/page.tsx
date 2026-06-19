import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getReport } from '@/lib/data/reports'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getHospitalHeader } from '@/lib/data/hospital-headers'
import { getRadiologistSignature } from '@/lib/data/profile'
import { parseHeaderChoice } from '@/lib/export/load'
import { buildSpecialFormTable } from '@/lib/reports/special-forms'
import type { HospitalHeader } from '@/types/hospital-header'

type Props = {
  params: Promise<{ id: string; locale: string }>
  searchParams: Promise<{ header?: string }>
}

export default async function ReportPrintPage({ params, searchParams }: Props) {
  const { id, locale } = await params
  const { header: headerParam } = await searchParams
  setRequestLocale(locale)
  await requireCurrentUser()

  const report = await getReport(id)
  if (!report) notFound()

  const choice = parseHeaderChoice(headerParam)
  const [study, patient, libraryHeader, sig] = await Promise.all([
    getStudy(report.studyId),
    getPatient(report.patientId),
    choice.headerId ? getHospitalHeader(choice.headerId) : Promise.resolve<HospitalHeader | null>(null),
    getRadiologistSignature(report.authorId),
  ])
  const showHeader = choice.includeHeader !== false
  const signatureName = sig?.name || 'Le Radiologue'
  const signatureTitle = sig?.title ?? ''

  const sd = report.structuredData
  const patientName = patient ? `${patient.lastName.toUpperCase()} ${patient.firstName}` : '—'
  const examDate    = study?.studyDate ?? report.createdAt.slice(0, 10)
  const examTitle   = sd?.examTitle ?? `${study?.modality ?? ''} — ${study?.bodyPart ?? ''}`

  return (
    <>
      {/* Print-only global styles */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 18mm 20mm 18mm 20mm;
        }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Times New Roman', serif; font-size: 11pt; color: #111; }
        @media screen {
          body { background: #f0f0f0; }
          .page { background: white; max-width: 210mm; margin: 24px auto; padding: 20mm; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
        }
        @media print {
          body { background: white; }
          .page { padding: 0; }
          .no-print { display: none !important; }
        }
        .header-bar { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
        .clinic-name { font-size: 13pt; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; }
        .dept-name   { font-size: 10pt; color: #444; margin-top: 2px; }
        .patient-box { border: 1px solid #888; padding: 6px 10px; margin: 14px 0; font-size: 10pt; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
        .patient-box .field { display: flex; gap: 6px; }
        .patient-box .lbl  { font-weight: bold; }
        .exam-title { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: underline; margin: 20px 0 18px; }
        .section { margin-bottom: 16px; }
        .section-label { font-weight: bold; text-decoration: underline; font-size: 11pt; margin-bottom: 6px; }
        .section-body  { font-size: 11pt; line-height: 1.65; white-space: pre-wrap; text-align: justify; }
        .measure-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin-top: 4px; }
        .measure-table th, .measure-table td { border: 1px solid #888; padding: 4px 8px; text-align: left; vertical-align: top; }
        .measure-table th { background: #ececec; font-weight: bold; }
        .measure-table td:first-child, .measure-table th:first-child { width: 46%; }
        .signature-row { margin-top: 32px; text-align: right; font-size: 11pt; }
        .print-btn { display: block; margin: 0 auto 24px; padding: 10px 28px; background: #1d4ed8; color: white; border: none; border-radius: 8px; font-size: 13px; font-family: sans-serif; cursor: pointer; }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print" style={{ textAlign: 'center', paddingTop: '24px' }}>
        <button className="print-btn" onClick={() => {}} id="print-trigger">
          Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* Auto-trigger print script */}
      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('print-trigger').addEventListener('click', () => window.print());
      `}} />

      <div className="page">

        {/* ── Hospital header ── (omitted for the classic model) */}
        {showHeader && (
          libraryHeader ? (
            <div className="header-bar">
              {libraryHeader.overline && (
                <div className="dept-name" style={{ whiteSpace: 'pre-line', marginBottom: '2px' }}>
                  {libraryHeader.overline}
                </div>
              )}
              <div className="clinic-name">{libraryHeader.name}</div>
              {libraryHeader.department && <div className="dept-name">{libraryHeader.department}</div>}
              {libraryHeader.subtitle && <div className="dept-name">{libraryHeader.subtitle}</div>}
              {(libraryHeader.phone || libraryHeader.email) && (
                <div className="dept-name">
                  {[libraryHeader.phone && `Tél : ${libraryHeader.phone}`, libraryHeader.email]
                    .filter(Boolean)
                    .join('   ·   ')}
                </div>
              )}
            </div>
          ) : (
            <div className="header-bar">
              <div className="clinic-name">Hôpital Principal de Dakar</div>
              <div className="dept-name">Service de Radiologie et Imagerie Médicale</div>
            </div>
          )
        )}

        {/* ── Patient info box ── */}
        <div className="patient-box">
          <div className="field">
            <span className="lbl">NOM — PRÉNOMS :</span>
            <span>{patientName}</span>
          </div>
          <div className="field">
            <span className="lbl">DATE :</span>
            <span>{examDate}</span>
          </div>
          <div className="field">
            <span className="lbl">SERVICE :</span>
            <span>{sd?.patient?.serviceOrWard ?? '—'}</span>
          </div>
          <div className="field">
            <span className="lbl">N° D&apos;EXAMEN :</span>
            <span>{study?.accessionNumber ?? '—'}</span>
          </div>
          {sd && sd.patient.age && sd.patient.age !== '—' && (
            <div className="field">
              <span className="lbl">ÂGE :</span>
              <span>{sd.patient.age}</span>
            </div>
          )}
          {sd && sd.patient.sex && sd.patient.sex !== '—' && (
            <div className="field">
              <span className="lbl">SEXE :</span>
              <span>{sd.patient.sex}</span>
            </div>
          )}
        </div>

        {/* ── Exam title ── */}
        <div className="exam-title">{examTitle}</div>

        {/* ── Structured sections ── */}
        {sd ? (
          <>
            {sd.indication && (
              <div className="section">
                <div className="section-label">INDICATION :</div>
                <div className="section-body">{sd.indication}</div>
              </div>
            )}
            {sd.technique && (
              <div className="section">
                <div className="section-label">TECHNIQUE :</div>
                <div className="section-body">{sd.technique}</div>
              </div>
            )}
            {sd.specialForm ? (
              <div className="section">
                <div className="section-label">RÉSULTATS :</div>
                {(() => {
                  const tbl = buildSpecialFormTable(sd.specialForm)
                  return (
                    <table className="measure-table">
                      <thead>
                        <tr>
                          {tbl.columns.map((c, i) => (
                            <th key={i}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tbl.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            ) : (
              sd.results && (
                <div className="section">
                  <div className="section-label">RÉSULTATS :</div>
                  <div className="section-body">{sd.results}</div>
                </div>
              )
            )}
            {sd.conclusion && (
              <div className="section">
                <div className="section-label">CONCLUSION :</div>
                <div className="section-body">{sd.conclusion}</div>
              </div>
            )}
            {sd.recommendations && (
              <div className="section">
                <div className="section-label">RECOMMANDATIONS :</div>
                <div className="section-body">{sd.recommendations}</div>
              </div>
            )}
          </>
        ) : (
          <>
            {report.findings && (
              <div className="section">
                <div className="section-label">RÉSULTATS :</div>
                <div className="section-body">{report.findings}</div>
              </div>
            )}
            {report.impression && (
              <div className="section">
                <div className="section-label">CONCLUSION :</div>
                <div className="section-body">{report.impression}</div>
              </div>
            )}
            {report.recommendations && (
              <div className="section">
                <div className="section-label">RECOMMANDATIONS :</div>
                <div className="section-body">{report.recommendations}</div>
              </div>
            )}
          </>
        )}

        {/* ── Signature ── (auto-inserted from the author's F11 profile) */}
        <div className="signature-row">
          <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>{signatureName}</div>
          {signatureTitle && (
            <div style={{ fontSize: '10pt', color: '#555' }}>{signatureTitle}</div>
          )}
          {report.signedAt && (
            <div style={{ fontSize: '10pt', color: '#555' }}>
              Signé le {report.signedAt.slice(0, 10)}
            </div>
          )}
        </div>

      </div>
    </>
  )
}
