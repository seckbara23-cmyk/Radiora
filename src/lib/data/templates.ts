import { createClient } from '@/lib/supabase/server'
import type { Template } from '@/types/template'

const SELECT_COLS =
  'id, clinic_id, title, modality, body_part, findings_template, impression_template, recommendations_template, is_active, created_by, created_at, updated_at'

function toTemplate(row: Record<string, unknown>): Template {
  return {
    id:                      row.id as string,
    clinicId:                row.clinic_id as string,
    title:                   row.title as string,
    modality:                (row.modality as string | null) ?? null,
    bodyPart:                (row.body_part as string | null) ?? null,
    findingsTemplate:        row.findings_template as string,
    impressionTemplate:      row.impression_template as string,
    recommendationsTemplate: row.recommendations_template as string,
    isActive:                row.is_active as boolean,
    createdBy:               (row.created_by as string | null) ?? null,
    createdAt:               row.created_at as string,
    updatedAt:               row.updated_at as string,
  }
}

export async function getTemplates(opts?: {
  activeOnly?: boolean
  modality?: string
}): Promise<Template[]> {
  const supabase = await createClient()

  let query = supabase
    .from('report_templates')
    .select(SELECT_COLS)
    .order('title', { ascending: true })

  if (opts?.activeOnly) {
    query = query.eq('is_active', true)
  }

  if (opts?.modality) {
    // Include templates that match this modality OR are generic (no modality set)
    query = query.or(`modality.eq.${opts.modality},modality.is.null`)
  }

  const { data } = await query
  return (data ?? []).map(toTemplate)
}

export async function getTemplate(id: string): Promise<Template | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('report_templates')
    .select(SELECT_COLS)
    .eq('id', id)
    .single()

  return data ? toTemplate(data) : null
}
