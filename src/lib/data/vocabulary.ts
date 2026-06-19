import { createClient } from '@/lib/supabase/server'
import type { VocabularyEntry } from '@/types/vocabulary'
import type { VocabularyKind } from '@/lib/ai/vocabulary'

const SELECT_COLS =
  'id, clinic_id, user_id, kind, modality, source_text, target_text, frequency, confidence, last_used_at, created_at, updated_at'

export function mapVocabularyRow(row: Record<string, unknown>): VocabularyEntry {
  const userId = (row.user_id as string | null) ?? null
  return {
    id:         row.id as string,
    clinicId:   row.clinic_id as string,
    userId,
    scope:      userId ? 'personal' : 'clinic',
    kind:       row.kind as VocabularyKind,
    modality:   (row.modality as string | null) ?? null,
    sourceText: row.source_text as string,
    targetText: row.target_text as string,
    frequency:  (row.frequency as number) ?? 0,
    confidence: Number(row.confidence ?? 0),
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    createdAt:  row.created_at as string,
    updatedAt:  row.updated_at as string,
  }
}

// Personal entries owned by the current radiologist. RLS already scopes to the
// caller, but we filter explicitly so clinic-wide rows aren't mixed in.
export async function getPersonalVocabulary(): Promise<VocabularyEntry[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('vocabulary_entries')
    .select(SELECT_COLS)
    .eq('user_id', user.id)
    .order('frequency', { ascending: false })
    .order('updated_at', { ascending: false })

  return (data ?? []).map((r) => mapVocabularyRow(r as unknown as Record<string, unknown>))
}

// Clinic-wide shared dictionary (user_id IS NULL). Visible to everyone in the clinic.
export async function getClinicVocabulary(): Promise<VocabularyEntry[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('vocabulary_entries')
    .select(SELECT_COLS)
    .is('user_id', null)
    .order('frequency', { ascending: false })
    .order('updated_at', { ascending: false })

  return (data ?? []).map((r) => mapVocabularyRow(r as unknown as Record<string, unknown>))
}

// Active vocabulary the editor should consider for suggestions: the caller's
// personal entries plus the clinic-wide dictionary, optionally filtered to a
// modality (modality-specific entries + modality-agnostic ones).
export async function getActiveVocabulary(modality?: string): Promise<VocabularyEntry[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('vocabulary_entries')
    .select(SELECT_COLS)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('confidence', { ascending: false })

  if (modality) {
    query = query.or(`modality.eq.${modality},modality.is.null`)
  }

  const { data } = await query
  return (data ?? []).map((r) => mapVocabularyRow(r as unknown as Record<string, unknown>))
}
