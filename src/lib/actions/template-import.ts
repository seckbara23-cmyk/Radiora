'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { parseTemplateDocument, guessModality } from '@/lib/templates/import-parser'
import { extractDocxText } from '@/lib/templates/docx-extract'
import { slugifyExam } from '@/config/exam-catalog'
import { STARTER_TEMPLATES, STARTER_LIBRARY_SOURCE } from '@/config/starter-templates'

const IMPORT_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const
type ImportRole = typeof IMPORT_ROLES[number]

/** One template ready to insert — what the preview shows and the commit consumes. */
export interface PreparedTemplate {
  title: string
  modality: string | null
  examType: string
  indication: string
  technique: string
  findings: string
  impression: string
}

export interface ImportState {
  error: string | null
  /** Parsed-but-not-saved templates for the confirmation step. */
  templates?: PreparedTemplate[]
  /** After a successful commit/install. */
  installed?: number
  skipped?: number
}

function canImport(role: string): role is ImportRole {
  return (IMPORT_ROLES as readonly string[]).includes(role)
}

function prepare(parsed: ReturnType<typeof parseTemplateDocument>): PreparedTemplate[] {
  return parsed
    .map((p) => ({
      title: p.title.trim(),
      modality: guessModality(p.title),
      examType: slugifyExam(p.title),
      indication: p.indication,
      technique: p.technique,
      findings: p.results,
      impression: p.conclusion,
    }))
    // A usable template needs at least a title and some findings.
    .filter((t) => t.title.length > 0 && t.findings.trim().length > 0)
}

/**
 * Step 1 — parse pasted text or an uploaded .docx into structured templates.
 * Writes nothing; returns the parsed templates for the user to confirm.
 */
export async function previewImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireCurrentUser()
  if (!canImport(user.role)) return { error: 'Vous n’avez pas la permission d’importer des modèles.' }

  const pasted = ((formData.get('text') as string) ?? '').trim()
  const file = formData.get('file') as File | null

  let text = pasted
  if (file && file.size > 0) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return { error: 'Seuls les fichiers Word (.docx) sont pris en charge. Pour un PDF, copiez-collez le texte.' }
    }
    if (file.size > 5 * 1024 * 1024) {
      return { error: 'Fichier trop volumineux (max 5 Mo).' }
    }
    const bytes = await file.arrayBuffer()
    const extracted = await extractDocxText(bytes)
    text = extracted.trim() || pasted
  }

  if (!text) return { error: 'Collez du texte ou choisissez un fichier .docx à importer.' }

  const templates = prepare(parseTemplateDocument(text))
  if (templates.length === 0) {
    return { error: 'Aucun modèle exploitable détecté. Vérifiez la présence des sections (INDICATION, TECHNIQUE, RÉSULTATS, CONCLUSION).' }
  }

  return { error: null, templates }
}

async function insertTemplates(
  rows: PreparedTemplate[],
  source: string,
): Promise<{ installed: number; skipped: number; error: string | null }> {
  const user = await requireCurrentUser()
  if (!canImport(user.role)) return { installed: 0, skipped: 0, error: 'Permission refusée.' }
  if (rows.length === 0) return { installed: 0, skipped: 0, error: 'Aucun modèle à enregistrer.' }

  const supabase = await createClient()

  // Skip titles that already exist in this clinic (case-insensitive) so installs
  // are idempotent and re-running never duplicates.
  const { data: existing } = await supabase
    .from('report_templates')
    .select('title')
    .eq('clinic_id', user.clinicId)
  const have = new Set((existing ?? []).map((r) => (r.title as string).trim().toLowerCase()))

  const fresh = rows.filter((r) => !have.has(r.title.trim().toLowerCase()))
  const skipped = rows.length - fresh.length
  if (fresh.length === 0) return { installed: 0, skipped, error: null }

  const payload = fresh.map((r) => ({
    clinic_id: user.clinicId,
    title: r.title,
    modality: r.modality,
    indication_template: r.indication,
    technique_template: r.technique,
    findings_template: r.findings,
    impression_template: r.impression || '—',
    recommendations_template: '',
    exam_type: r.examType || null,
    source,
    created_by: user.id,
  }))

  const { error } = await supabase.from('report_templates').insert(payload)
  if (error) return { installed: 0, skipped, error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'template.imported', entityType: 'template_import',
    entityId: user.clinicId ?? user.id,
    metadata: { count: fresh.length, source },
  })

  revalidatePath('/templates')
  return { installed: fresh.length, skipped, error: null }
}

/** Step 2 — persist the confirmed templates (payload = JSON of PreparedTemplate[]). */
export async function commitImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const raw = (formData.get('payload') as string) ?? '[]'
  let rows: PreparedTemplate[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('bad payload')
    rows = parsed.map((r) => ({
      title: String(r.title ?? '').trim(),
      modality: r.modality ? String(r.modality) : null,
      examType: String(r.examType ?? '').trim(),
      indication: String(r.indication ?? ''),
      technique: String(r.technique ?? ''),
      findings: String(r.findings ?? ''),
      impression: String(r.impression ?? ''),
    })).filter((r) => r.title && r.findings.trim())
  } catch {
    return { error: 'Données d’import invalides.' }
  }

  const source = ((formData.get('source') as string) ?? 'import:paste').trim() || 'import:paste'
  const res = await insertTemplates(rows, source === 'import:docx' ? 'import:docx' : 'import:paste')
  if (res.error) return { error: res.error }
  return { error: null, installed: res.installed, skipped: res.skipped }
}

/** Install the bundled Dr ABIBOU BA normal-template library into the clinic. */
export async function installStarterLibrary(
  _prev: ImportState,
  _formData: FormData,
): Promise<ImportState> {
  const rows: PreparedTemplate[] = STARTER_TEMPLATES.map((t) => ({
    title: t.title,
    modality: t.modality,
    examType: t.examType,
    indication: t.indication,
    technique: t.technique,
    findings: t.findings,
    impression: t.impression,
  }))
  const res = await insertTemplates(rows, STARTER_LIBRARY_SOURCE)
  if (res.error) return { error: res.error }
  return { error: null, installed: res.installed, skipped: res.skipped }
}
