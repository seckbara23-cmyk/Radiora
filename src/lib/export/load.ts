// Feature 9 — server-side assembly of a report's export model.
//
// Reads happen through the USER-SESSION client so RLS enforces tenant isolation:
// a caller can only export a report whose clinic matches their own. Optional
// branding images are fetched best-effort (the service-role client can read the
// private clinic-branding bucket); any failure degrades silently to text-only.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReport } from '@/lib/data/reports'
import { getStudy } from '@/lib/data/studies'
import { getPatient } from '@/lib/data/patients'
import { getHospitalHeader } from '@/lib/data/hospital-headers'
import { buildReportExportModel, type ReportExportModel, type ExportHeaderOverride } from './model'
import type { ExportImages } from './pdf'

/**
 * How to render the letterhead (F12):
 *  - omitted              → the clinic's default header
 *  - { headerId }         → a chosen library header
 *  - { includeHeader:false } → the "classic" model with no header
 */
export interface ExportHeaderChoice {
  headerId?: string | null
  includeHeader?: boolean
}

// Resolve a query-string ?header= value into a header choice.
export function parseHeaderChoice(raw: string | null | undefined): ExportHeaderChoice {
  const v = (raw ?? '').trim()
  if (!v) return {}
  if (v === 'none') return { includeHeader: false }
  return { headerId: v }
}

const BRANDING_BUCKET = 'clinic-branding'

interface ImageRef {
  bytes: Uint8Array
  mime: string
}

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

// A branding value is either an external https URL or a path inside the private
// clinic-branding bucket. Returns undefined on any problem — branding is optional.
async function loadImageRef(ref: string | null | undefined): Promise<ImageRef | undefined> {
  const value = (ref ?? '').trim()
  if (!value) return undefined
  try {
    if (/^https?:\/\//i.test(value)) {
      const res = await fetch(value)
      if (!res.ok) return undefined
      const buf = new Uint8Array(await res.arrayBuffer())
      return { bytes: buf, mime: res.headers.get('content-type') ?? mimeFromPath(value) }
    }
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BRANDING_BUCKET).download(value)
    if (error || !data) return undefined
    const buf = new Uint8Array(await data.arrayBuffer())
    return { bytes: buf, mime: data.type || mimeFromPath(value) }
  } catch {
    return undefined
  }
}

export interface AssembledExport {
  model: ReportExportModel
  images: ExportImages
  clinicId: string
  status: string
}

// Returns null when the report does not exist or RLS hides it from this caller.
export async function assembleReportExport(
  reportId: string,
  headerChoice: ExportHeaderChoice = {},
): Promise<AssembledExport | null> {
  const report = await getReport(reportId)
  if (!report) return null

  // Resolve a chosen library header (RLS guards visibility) up-front so we can
  // pass it to the model builder and load its own logo.
  let headerOverride: ExportHeaderOverride | null = null
  let overrideLogo: string | null = null
  if (headerChoice.includeHeader !== false && headerChoice.headerId) {
    const hdr = await getHospitalHeader(headerChoice.headerId)
    if (hdr) {
      headerOverride = {
        name: hdr.name,
        overline: hdr.overline,
        department: hdr.department,
        subtitle: hdr.subtitle,
        address: hdr.address,
        phone: hdr.phone,
        email: hdr.email,
      }
      overrideLogo = hdr.logoUrl
    }
  }

  const supabase = await createClient()
  const [study, patient, clinicRes, radioRes] = await Promise.all([
    getStudy(report.studyId),
    getPatient(report.patientId),
    supabase
      .from('clinics')
      .select('name, department_name, report_header, address, city, phone, email, website, logo_url')
      .eq('id', report.clinicId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('first_name, last_name, signature_title, signature_url, stamp_url')
      .eq('id', report.authorId)
      .maybeSingle(),
  ])

  const clinicRow = clinicRes.data as Record<string, string | null> | null
  const radioRow = radioRes.data as Record<string, string | null> | null

  const model = buildReportExportModel({
    report: {
      status: report.status,
      signedAt: report.signedAt,
      structuredData: report.structuredData,
      findings: report.findings,
      impression: report.impression,
      recommendations: report.recommendations,
      examType: report.examType,
      createdAt: report.createdAt,
    },
    study: study
      ? {
          studyDate: study.studyDate,
          accessionNumber: study.accessionNumber,
          modality: study.modality,
          bodyPart: study.bodyPart,
        }
      : null,
    patient: patient
      ? {
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          sex: patient.sex,
        }
      : null,
    clinic: clinicRow
      ? {
          name: clinicRow.name ?? '',
          departmentName: clinicRow.department_name ?? undefined,
          reportHeader: clinicRow.report_header ?? undefined,
          address: clinicRow.address ?? undefined,
          city: clinicRow.city ?? undefined,
          phone: clinicRow.phone ?? undefined,
          email: clinicRow.email ?? undefined,
          website: clinicRow.website ?? undefined,
        }
      : null,
    radiologist: radioRow
      ? {
          firstName: radioRow.first_name ?? '',
          lastName: radioRow.last_name ?? '',
          signatureTitle: radioRow.signature_title ?? undefined,
        }
      : null,
    headerOverride,
    includeHeader: headerChoice.includeHeader,
  })

  // A library header brings its own logo; otherwise use the clinic's. The classic
  // (no-header) model carries no logo at all.
  const logoRef =
    headerChoice.includeHeader === false ? null : (overrideLogo ?? clinicRow?.logo_url)

  const [logo, signature, stamp] = await Promise.all([
    loadImageRef(logoRef),
    loadImageRef(radioRow?.signature_url),
    loadImageRef(radioRow?.stamp_url),
  ])

  return {
    model,
    images: { logo, signature, stamp },
    clinicId: report.clinicId,
    status: report.status,
  }
}
