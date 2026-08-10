'use server'

// R2.2 — report-owned dictation: persist a transcript against a report and run
// the CANONICAL structuring pipeline over it.
//
// This is the report-side twin of actions/structuring.ts (which serves the
// vacation queue). It deliberately shares the same engine — buildHpdDraft →
// runStructuring — rather than introducing a second structuring path, and it
// writes to the same `transcriptions` table using the ownership contract from
// migration 044.
//
// It does NOT stream. The flow this supports is:
//
//   record / upload → complete transcript → canonical structuring → review-ready
//
// Live section population stays out of R2.2; a partial transcript must never
// drive an automatic report mutation (see the R1 freeze §8.1).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { buildHpdDraft, type HpdStructuringMeta } from '@/lib/ai/hpd-draft'
import { isReportContentLocked } from '@/lib/safety/immutability'
import { canEditClinicalContent } from '@/lib/safety/authority'
import { reportOwner, ownerColumns, audioOwnerColumns, ownerAuditMetadata } from '@/lib/dictation/owner'
import { nextSourceTranscript } from '@/lib/dictation/transcription-state'
import { ageLabel, displayPatientName, frenchSexLabel } from '@/lib/reports/patient-identity'
import { AUDIO_BUCKET, ACCEPTED_AUDIO_EXT, MAX_AUDIO_BYTES } from '@/types/audio'
import type { StructuredReportData } from '@/types/report'

export type ReportTranscriptResult = { error: string | null; transcriptionId?: string }

export type ReportAudioResult = { error: string | null; assetId?: string }

export type ReportStructureResult = {
  error: string | null
  output?: StructuredReportData
  structuring?: HpdStructuringMeta
}

/**
 * Load the report and confirm the caller may attach dictation to it.
 * Clinic comes from the report row itself (RLS-scoped), never from the client.
 */
async function loadWritableReport(reportId: string) {
  const user = await requireCurrentUser()
  if (!canEditClinicalContent(user.role)) {
    return { error: 'You do not have permission to dictate on this report.' as string, user: null, report: null }
  }

  const supabase = await createClient()
  const { data: report, error } = await supabase
    .from('reports')
    .select('id, status, clinic_id, study_id, patient_id')
    .eq('id', reportId)
    .maybeSingle()

  if (error)   return { error: error.message, user: null, report: null }
  if (!report) return { error: 'Report not found.', user: null, report: null }

  if (isReportContentLocked(report.status as string)) {
    return {
      error: 'This report is signed. Use "Amend Report" to re-open it before dictating again.',
      user: null,
      report: null,
    }
  }

  return { error: null as string | null, user, report }
}

// ─── saveReportTranscript ─────────────────────────────────────────────────────
// Persists (or updates) the transcript owned by this report. This is what makes
// R2.0's review metadata survive a reload: before R2.2 a report created from a
// study had nowhere to store a transcript at all.

export async function saveReportTranscript(
  reportId: string,
  rawText: string,
  correctedText?: string,
): Promise<ReportTranscriptResult> {
  if (!reportId) return { error: 'Missing report.' }

  const { error: gateError, user, report } = await loadWritableReport(reportId)
  if (gateError || !user || !report) return { error: gateError ?? 'Report not found.' }

  const supabase = await createClient()
  const owner = reportOwner(reportId)

  const { data: existing, error: findError } = await supabase
    .from('transcriptions')
    .select('id, raw_text')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) return { error: findError.message }

  const payload = {
    raw_text:       rawText ?? '',
    corrected_text: correctedText ?? rawText ?? '',
  }

  let transcriptionId: string

  if (existing?.id) {
    // R2.7C — the transcript box in the workspace is editable, so this call can
    // carry a CLINICIAN-EDITED transcript. The edit belongs in the working copy;
    // the provider/browser source is evidence and is only ever extended by more
    // dictation, never rewritten by an edit. See nextSourceTranscript.
    const { error } = await supabase
      .from('transcriptions')
      .update({
        ...payload,
        raw_text: nextSourceTranscript((existing.raw_text as string) ?? '', rawText ?? ''),
      })
      .eq('id', existing.id as string)
    if (error) return { error: error.message }
    transcriptionId = existing.id as string
  } else {
    const { data, error } = await supabase
      .from('transcriptions')
      .insert({
        // clinic_id comes from the report row, not the client.
        clinic_id:  report.clinic_id as string,
        ...ownerColumns(owner),
        created_by: user.id,
        ...payload,
      })
      .select('id')
      .single()
    if (error || !data) return { error: error?.message ?? 'Could not save the transcript.' }
    transcriptionId = data.id as string
  }

  // Size only. Computed here so the audit payload below provably contains no
  // transcript variable at all.
  const transcriptLength = (rawText ?? '').length

  await logAudit({
    userId: user.id,
    clinicId: report.clinic_id as string,
    action: 'dictation.transcript_saved',
    entityType: 'report',
    entityId: reportId,
    // Owner identity and size only — never the transcript body.
    metadata: { ...ownerAuditMetadata(owner), transcriptionId, length: transcriptLength },
  })

  revalidatePath(`/reports/${reportId}`)
  return { error: null, transcriptionId }
}

// ─── importReportAudio ────────────────────────────────────────────────────────
// R2.3 — the "import an audio file" method. Reuses the existing private
// dictation-audio bucket and the same size/MIME limits as the queue uploader;
// the only difference is the owner. It never creates unowned audio: the report
// is always the owner on this path (batch/unassigned ingestion stays available
// through the queue uploader, unchanged).

export async function importReportAudio(
  reportId: string,
  formData: FormData,
): Promise<ReportAudioResult> {
  if (!reportId) return { error: 'Missing report.' }

  const { error: gateError, user, report } = await loadWritableReport(reportId)
  if (gateError || !user || !report) return { error: gateError ?? 'Report not found.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose an audio file.' }
  if (file.size > MAX_AUDIO_BYTES) return { error: 'The audio file is too large (max 100 MB).' }

  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  if (!(ACCEPTED_AUDIO_EXT as readonly string[]).includes(ext)) {
    return { error: 'Unsupported format. Use MP3, MP4, WAV or M4A.' }
  }

  const supabase = await createClient()
  const clinicId = report.clinic_id as string
  const assetId  = crypto.randomUUID()
  const path     = `${clinicId}/${assetId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

  const owner = reportOwner(reportId)

  const { error: assetError } = await supabase.from('audio_assets').insert({
    id:                assetId,
    clinic_id:         clinicId,
    ...audioOwnerColumns(owner),
    uploaded_by:       user.id,
    original_filename: file.name,
    mime_type:         file.type || 'application/octet-stream',
    file_size_bytes:   file.size,
    storage_path:      path,
    ingestion_mode:    'single',
    status:            'assigned',
  })
  if (assetError) {
    // Roll back the object so storage never drifts from the table.
    await supabase.storage.from(AUDIO_BUCKET).remove([path])
    return { error: assetError.message }
  }

  // Open (or attach to) the report's transcript so the doctor has somewhere to
  // type what the recording says — this product calls no external STT.
  const { data: existing, error: findError } = await supabase
    .from('transcriptions')
    .select('id')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) return { error: findError.message }

  if (existing?.id) {
    const { error } = await supabase
      .from('transcriptions')
      .update({ audio_asset_id: assetId })
      .eq('id', existing.id as string)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('transcriptions').insert({
      clinic_id:      clinicId,
      ...ownerColumns(owner),
      audio_asset_id: assetId,
      created_by:     user.id,
    })
    if (error) return { error: error.message }
  }

  await logAudit({
    userId: user.id,
    clinicId,
    action: 'audio.uploaded',
    entityType: 'audio_asset',
    entityId: assetId,
    metadata: { ...ownerAuditMetadata(owner), method: 'import', sizeBytes: file.size },
  })

  revalidatePath(`/reports/${reportId}`)
  return { error: null, assetId }
}

// ─── structureReportTranscript ────────────────────────────────────────────────
// Runs the canonical pipeline over the report's stored transcript and persists
// the four layers, exactly as the queue path does. It returns the draft for
// review; it NEVER writes report content — acceptance stays with the
// radiologist through acceptHPDDraft.

export async function structureReportTranscript(reportId: string): Promise<ReportStructureResult> {
  if (!reportId) return { error: 'Missing report.' }

  const { error: gateError, user, report } = await loadWritableReport(reportId)
  if (gateError || !user || !report) return { error: gateError ?? 'Report not found.' }

  const supabase = await createClient()

  const { data: tr, error: findError } = await supabase
    .from('transcriptions')
    .select('id, raw_text, corrected_text')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) return { error: findError.message }

  const source = ((tr?.corrected_text as string) || (tr?.raw_text as string) || '').trim()
  if (!source) return { error: 'There is no transcript to structure yet.' }

  // Exam context for the HPD header, read through RLS.
  let modality: string | null = null
  let bodyPart: string | null = null
  if (report.study_id) {
    const { data: study } = await supabase
      .from('studies')
      .select('modality, body_part')
      .eq('id', report.study_id as string)
      .maybeSingle()
    modality = (study?.modality as string | null) ?? null
    bodyPart = (study?.body_part as string | null) ?? null
  }

  // R2.7C(F) — patient context for the HPD header, read through RLS.
  //
  // Omitting it is what produced the production defect: buildHpdDraft defaults
  // these to '', the HPD engine renders `patientName || '—'`, and applying the
  // draft wrote that em dash into the report's patient block permanently. The
  // sibling queue action (lib/actions/structuring.ts) always loaded this; the
  // report path simply never did.
  let patientName = '', patientAge = '', patientSex = ''
  if (report.patient_id) {
    const { data: p } = await supabase
      .from('patients')
      .select('first_name, last_name, date_of_birth, sex')
      .eq('id', report.patient_id as string)
      .maybeSingle()
    if (p) {
      patientName = displayPatientName(p.last_name as string, p.first_name as string)
      patientSex  = frenchSexLabel(p.sex as string)
      patientAge  = ageLabel(p.date_of_birth as string | null)
    }
  }

  // The canonical pipeline — the same one the queue and R2.0 use.
  const { output, structuring } = buildHpdDraft({
    rawTranscript: source,
    modality,
    bodyPart,
    patientName,
    patientAge,
    patientSex,
    locale: 'fr',
  })

  // Persist the four layers so the signing gate still sees the confidence after
  // a reload (getReportSafetyContext reads report-owned transcripts first).
  const { error: persistError } = await supabase
    .from('transcriptions')
    .update({
      cleaned_text:      structuring.cleanedTranscript,
      correction_events: structuring.correctionEvents as unknown as Record<string, unknown>[],
      structured_json:   output as unknown as Record<string, unknown>,
      confidence:        structuring.confidence as unknown as Record<string, unknown>[],
      structured_at:     new Date().toISOString(),
      structured_by:     user.id,
    })
    .eq('id', tr!.id as string)
  if (persistError) return { error: `Could not save the structuring result: ${persistError.message}` }

  await logAudit({
    userId: user.id,
    clinicId: report.clinic_id as string,
    action: 'structuring.generated',
    entityType: 'report',
    entityId: reportId,
    metadata: {
      ...ownerAuditMetadata(reportOwner(reportId)),
      reviewRequired: structuring.reviewRequired,
      corrections: structuring.correctionEvents.length,
      warnings: structuring.warnings.length,
    },
  })

  revalidatePath(`/reports/${reportId}`)
  return { error: null, output, structuring }
}
