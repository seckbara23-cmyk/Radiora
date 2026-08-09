'use server'

// F17 — Secure Report Delivery (STAFF actions).
//
// createDelivery enforces the validation gate (finalized/signed only), then
// renders the PDF and DOCX with the SAME pipeline as the F9 export and freezes
// them into the private report-deliveries bucket, so the file a patient later
// downloads is byte-identical to the staff export. No PHI is transmitted to any
// external service — a "delivery" is an in-app secure link plus an audit trail.

import { revalidatePath } from 'next/cache'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReport } from '@/lib/data/reports'
import { getPatient } from '@/lib/data/patients'
import { assembleReportExport, parseHeaderChoice } from '@/lib/export/load'
import { renderReportPdf } from '@/lib/export/pdf'
import { renderReportDocx } from '@/lib/export/docx'
import { logAudit } from '@/lib/actions/audit'
import { enqueueWhatsAppNotification } from '@/lib/notifications/enqueue'
import {
  isReportDeliverable,
  isDeliveryChannel,
  auditActionForChannel,
  dobToPassword,
  addDaysISO,
  resolveExpiryDays,
  type DeliveryChannel,
  type PasswordKind,
} from '@/lib/delivery/policy'
import { generateDeliveryToken, hashDeliveryPassword } from '@/lib/delivery/secure'

const REVIEW_ROLES = ['super_admin', 'clinic_admin', 'radiologist']
const BUCKET = 'report-deliveries'

export type DeliveryFormState = { ok: boolean; error?: string; token?: string }

interface CreateDeliveryInput {
  reportId: string
  channel: string
  recipientLabel?: string
  header?: string
  passwordKind?: string
  customPassword?: string
  expiresInDays?: number | null
}

export async function createDelivery(input: CreateDeliveryInput): Promise<DeliveryFormState> {
  const user = await requireCurrentUser()
  if (!REVIEW_ROLES.includes(user.role)) {
    return { ok: false, error: 'forbidden' }
  }
  if (!isDeliveryChannel(input.channel)) {
    return { ok: false, error: 'invalid_channel' }
  }
  const channel: DeliveryChannel = input.channel

  // ── Validation gate: only a validated report may be delivered ──────────────
  const report = await getReport(input.reportId)
  if (!report) return { ok: false, error: 'not_found' }
  if (!isReportDeliverable(report.status, report.signedAt)) {
    return { ok: false, error: 'not_validated' }
  }

  // ── Resolve the password policy ────────────────────────────────────────────
  let passwordKind: PasswordKind = 'none'
  let passwordHash: string | null = null
  if (input.passwordKind === 'dob') {
    const patient = await getPatient(report.patientId)
    const dobPw = dobToPassword(patient?.dateOfBirth ?? null)
    if (!dobPw) return { ok: false, error: 'no_dob' }
    passwordKind = 'dob'
    passwordHash = hashDeliveryPassword(dobPw)
  } else if (input.passwordKind === 'custom') {
    const pw = (input.customPassword ?? '').trim()
    if (pw.length < 4) return { ok: false, error: 'weak_password' }
    passwordKind = 'custom'
    passwordHash = hashDeliveryPassword(pw)
  }

  // ── Render PDF + DOCX under the caller's RLS (byte-identical to F9 export) ──
  const headerRaw = (input.header ?? '').trim()
  const choice = parseHeaderChoice(headerRaw)
  const assembled = await assembleReportExport(input.reportId, choice)
  if (!assembled) return { ok: false, error: 'render_failed' }

  const [pdfBytes, docxBytes] = await Promise.all([
    renderReportPdf(assembled.model, assembled.images),
    renderReportDocx(assembled.model, assembled.images),
  ])

  // ── Freeze the files into the private bucket (service-role) ────────────────
  const token = generateDeliveryToken()
  const pdfPath = `${assembled.clinicId}/${token}.pdf`
  const docxPath = `${assembled.clinicId}/${token}.docx`
  try {
    const admin = createAdminClient()
    const up1 = await admin.storage.from(BUCKET).upload(pdfPath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    })
    const up2 = await admin.storage.from(BUCKET).upload(docxPath, Buffer.from(docxBytes), {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    })
    if (up1.error || up2.error) return { ok: false, error: 'storage_failed' }
  } catch {
    return { ok: false, error: 'storage_failed' }
  }

  // R0.5 — expiry is mandatory: a link carrying a frozen copy of a patient's
  // report must never live forever. An omitted or out-of-range value is clamped
  // to the default/maximum rather than becoming NULL.
  const expiresAt = addDaysISO(new Date().toISOString(), resolveExpiryDays(input.expiresInDays))

  // ── Insert the delivery row under RLS (clinic + role enforced) ─────────────
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('report_deliveries')
    .insert({
      clinic_id: assembled.clinicId,
      report_id: input.reportId,
      channel,
      recipient_label: (input.recipientLabel ?? '').trim(),
      token,
      password_kind: passwordKind,
      password_hash: passwordHash,
      pdf_path: pdfPath,
      docx_path: docxPath,
      filename_base: assembled.model.filenameBase,
      header_choice: headerRaw,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle()

  if (error || !data) {
    // Roll back the frozen files so we don't leak orphaned PHI.
    try {
      const admin = createAdminClient()
      await admin.storage.from(BUCKET).remove([pdfPath, docxPath])
    } catch {
      /* best effort */
    }
    return { ok: false, error: 'insert_failed' }
  }

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: auditActionForChannel(channel),
    entityType: 'report',
    entityId: input.reportId,
    metadata: {
      deliveryId: (data as { id: string }).id,
      channel,
      passwordKind,
      expiresAt,
      hasExpiry: Boolean(expiresAt),
    },
  })

  // Phase 4F — notify if the clinic enabled WhatsApp for delivered reports.
  // PHI-free by construction; best-effort (never blocks delivery).
  await enqueueWhatsAppNotification(user.clinicId, 'report_delivered')

  revalidatePath(`/reports/${input.reportId}`)
  return { ok: true, token }
}

export async function revokeDelivery(deliveryId: string, reportId: string): Promise<DeliveryFormState> {
  const user = await requireCurrentUser()
  if (!REVIEW_ROLES.includes(user.role)) return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  // Fetch paths first (RLS-scoped) so we can also purge the frozen files.
  const { data: row } = await supabase
    .from('report_deliveries')
    .select('pdf_path, docx_path, revoked_at')
    .eq('id', deliveryId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'not_found' }

  const { error } = await supabase
    .from('report_deliveries')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', deliveryId)
  if (error) return { ok: false, error: 'update_failed' }

  // Purge the stored files so a revoked link can never serve content again.
  try {
    const admin = createAdminClient()
    const paths = [row.pdf_path, row.docx_path].filter(Boolean) as string[]
    if (paths.length) await admin.storage.from(BUCKET).remove(paths)
  } catch {
    /* best effort */
  }

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'secure_link_revoked',
    entityType: 'report',
    entityId: reportId,
    metadata: { deliveryId },
  })

  revalidatePath(`/reports/${reportId}`)
  return { ok: true }
}
