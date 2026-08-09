// R0.4 — browser print view, rendered from the SAME deterministic export model
// as the PDF and DOCX renderers.
//
// Previously this page built its own layout from raw report fields, which meant
// it silently escaped two guarantees the export pipeline enforces:
//   * a draft printed with NO "BROUILLON" watermark and an unconditional
//     signature block — an unvalidated report came out looking authored and
//     signed;
//   * section order / legacy fallback logic was duplicated here and could drift
//     from model.ts.
// Both now come from buildReportExportModel via assembleReportExport, so print
// output is structurally identical to the exported file, as model.ts promises.

import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { assembleReportExport, parseHeaderChoice } from '@/lib/export/load'
import { PrintButton } from './PrintButton'

type Props = {
  params: Promise<{ id: string; locale: string }>
  searchParams: Promise<{ header?: string }>
}

export default async function ReportPrintPage({ params, searchParams }: Props) {
  const { id, locale } = await params
  const { header: headerParam } = await searchParams
  setRequestLocale(locale)
  await requireCurrentUser()

  // RLS-scoped: returns null when the report does not exist or belongs to
  // another clinic, so a cross-tenant id renders a 404 rather than content.
  const assembled = await assembleReportExport(id, parseHeaderChoice(headerParam))
  if (!assembled) notFound()

  const { model } = assembled
  const hasHeader = Boolean(model.header.hospital || model.header.department)

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
        .page { position: relative; }
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
        .draft-banner { border: 2px solid #b91c1c; color: #b91c1c; font-family: sans-serif; font-size: 10pt; font-weight: bold; letter-spacing: 0.12em; text-align: center; padding: 6px; margin-bottom: 14px; text-transform: uppercase; }
        /* The watermark must survive the browser's "background graphics off"
           default, hence print-color-adjust. */
        .watermark {
          position: fixed;
          top: 45%; left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-family: sans-serif;
          font-size: 72pt;
          font-weight: bold;
          letter-spacing: 0.1em;
          color: rgba(185, 28, 28, 0.16);
          white-space: nowrap;
          pointer-events: none;
          z-index: 9999;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <div className="no-print" style={{ textAlign: 'center', paddingTop: '24px' }}>
        <PrintButton label="Imprimer / Enregistrer en PDF" />
      </div>

      {/* Draft watermark — mirrors model.watermark used by the PDF/DOCX renderers */}
      {model.watermark && <div className="watermark">{model.watermark}</div>}

      <div className="page">

        {model.isDraft && (
          <div className="draft-banner">
            {model.watermark} — document non validé, ne pas diffuser
          </div>
        )}

        {/* ── Hospital header ── (omitted for the classic model) */}
        {hasHeader && (
          <div className="header-bar">
            {model.header.overline && (
              <div className="dept-name" style={{ whiteSpace: 'pre-line', marginBottom: '2px' }}>
                {model.header.overline}
              </div>
            )}
            {model.header.hospital && <div className="clinic-name">{model.header.hospital}</div>}
            {model.header.department && <div className="dept-name">{model.header.department}</div>}
            {model.header.subtitle && <div className="dept-name">{model.header.subtitle}</div>}
            {model.header.address && <div className="dept-name">{model.header.address}</div>}
            {model.header.contact && <div className="dept-name">{model.header.contact}</div>}
          </div>
        )}

        {/* ── Patient info box ── */}
        <div className="patient-box">
          {model.patientFields.map((f) => (
            <div className="field" key={f.label}>
              <span className="lbl">{f.label} :</span>
              <span>{f.value}</span>
            </div>
          ))}
        </div>

        {/* ── Exam title ── */}
        <div className="exam-title">{model.examTitle}</div>

        {/* ── Sections, in the model's fixed clinical order ── */}
        {model.sections.map((section) => (
          <div className="section" key={section.label}>
            <div className="section-label">{section.label} :</div>
            {section.table ? (
              <table className="measure-table">
                <thead>
                  <tr>
                    {section.table.columns.map((c, i) => (
                      <th key={i}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="section-body">{section.body}</div>
            )}
          </div>
        ))}

        {/* ── Signature ── only on a validated report. A draft carries no
             signature block at all: printing one would assert authorship the
             radiologist has not given. */}
        {!model.isDraft && (
          <div className="signature-row">
            <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>{model.signature.name}</div>
            {model.signature.title && (
              <div style={{ fontSize: '10pt', color: '#555' }}>{model.signature.title}</div>
            )}
            {model.signature.signedDate && (
              <div style={{ fontSize: '10pt', color: '#555' }}>
                Signé le {model.signature.signedDate}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}
