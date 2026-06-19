'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import {
  learnCorrectionPairs,
  changesClinicalMeaning,
  vocabularyConfidence,
  findVocabularyMatches,
  type VocabularyKind,
} from '@/lib/ai/vocabulary'
import { getActiveVocabulary } from '@/lib/data/vocabulary'

export type VocabFormState = { error: string | null; saved?: boolean; learned?: number }

const REVIEW_ROLES = ['clinic_admin', 'radiologist', 'super_admin'] as const
const ADMIN_ROLES = ['clinic_admin', 'super_admin'] as const
const KINDS: VocabularyKind[] = ['word', 'phrase', 'spelling', 'terminology', 'conclusion']

function canReview(role: string): boolean {
  return (REVIEW_ROLES as readonly string[]).includes(role)
}
function isAdmin(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}
function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string) ?? '').trim()
}

// ─── recordVocabularyLearning ────────────────────────────────────────────────
// Learns wording corrections from a radiologist's edit of their own transcript.
// Pure code (learnCorrectionPairs) extracts only short, meaning-preserving pairs;
// the learn_vocabulary_entry RPC upserts each into the caller's PERSONAL
// dictionary and bumps its frequency/confidence. Never auto-applies anything.
export async function recordVocabularyLearning(
  originalText: string,
  editedText: string,
  modality?: string | null,
): Promise<{ learned: number }> {
  const user = await requireCurrentUser()
  if (!canReview(user.role)) return { learned: 0 }

  const pairs = learnCorrectionPairs(originalText ?? '', editedText ?? '')
  if (pairs.length === 0) return { learned: 0 }

  const supabase = await createClient()
  let learned = 0

  for (const pair of pairs) {
    const { data, error } = await supabase.rpc('learn_vocabulary_entry', {
      p_kind:     pair.kind,
      p_modality: modality ?? null,
      p_source:   pair.source,
      p_target:   pair.target,
    })
    if (!error && data) learned++
  }

  if (learned > 0) {
    // Audit the learning event — non-critical, never blocks the edit.
    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'vocabulary.learned', entityType: 'vocabulary_entry', entityId: user.id,
      metadata: {
        learned,
        modality: modality ?? null,
        pairs: pairs.map((p) => ({ source: p.source, target: p.target, kind: p.kind })),
      },
    })
    revalidatePath('/settings/vocabulary')
  }

  return { learned }
}

// ─── suggestVocabulary ───────────────────────────────────────────────────────
// Read-side feedback: returns the caller's learned vocabulary as SUGGESTIONS for
// a transcript (same shape as the static medical corrections). Never auto-applied
// and meaning-changing entries are skipped defensively in findVocabularyMatches.
export type VocabSuggestion = {
  term: string
  original: string
  replacement: string
  startIndex: number
  endIndex: number
}

export async function suggestVocabulary(
  text: string,
  modality?: string | null,
): Promise<VocabSuggestion[]> {
  const user = await requireCurrentUser()
  if (!canReview(user.role)) return []
  if (!text || !text.trim()) return []

  const entries = await getActiveVocabulary(modality ?? undefined)
  const matches = findVocabularyMatches(
    text,
    entries.map((e) => ({
      id: e.id,
      source: e.sourceText,
      target: e.targetText,
      confidence: e.confidence,
    })),
  )

  return matches.map((m) => ({
    term: m.term,
    original: m.original,
    replacement: m.replacement,
    startIndex: m.startIndex,
    endIndex: m.endIndex,
  }))
}

// ─── addVocabularyEntry ──────────────────────────────────────────────────────
// Manually add a correction to the personal or (admin only) clinic dictionary.
export async function addVocabularyEntry(
  _prev: VocabFormState,
  formData: FormData,
): Promise<VocabFormState> {
  const user = await requireCurrentUser()
  if (!canReview(user.role)) return { error: 'Permission refusée.' }

  const scope = str(formData, 'scope') === 'clinic' ? 'clinic' : 'personal'
  if (scope === 'clinic' && !isAdmin(user.role)) {
    return { error: 'Seul un administrateur peut modifier le dictionnaire de la clinique.' }
  }

  const source = str(formData, 'source')
  const target = str(formData, 'target')
  if (!source || !target) {
    return { error: 'Le terme dicté et le terme préféré sont obligatoires.' }
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    return { error: 'Les deux termes sont identiques.' }
  }
  // SAFETY: never store a pair that would change clinical meaning.
  if (changesClinicalMeaning(source, target)) {
    return { error: 'Correction refusée : elle modifierait le sens clinique (incertitude, négation ou mesure).' }
  }

  const kindRaw = str(formData, 'kind') as VocabularyKind
  const kind: VocabularyKind = KINDS.includes(kindRaw) ? kindRaw : 'phrase'
  const modality = str(formData, 'modality') || null

  const supabase = await createClient()

  if (scope === 'personal') {
    const { data, error } = await supabase.rpc('learn_vocabulary_entry', {
      p_kind: kind, p_modality: modality, p_source: source, p_target: target,
    })
    if (error) return { error: error.message }
    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'vocabulary.added', entityType: 'vocabulary_entry', entityId: (data as string) ?? user.id,
      metadata: { scope, kind, modality, source, target },
    })
  } else {
    const { data, error } = await supabase
      .from('vocabulary_entries')
      .insert({
        clinic_id:    user.clinicId,
        user_id:      null,
        kind,
        modality,
        source_text:  source,
        target_text:  target,
        frequency:    1,
        confidence:   vocabularyConfidence(1),
        last_used_at: new Date().toISOString(),
        created_by:   user.id,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'vocabulary.clinic_added', entityType: 'vocabulary_entry', entityId: data.id as string,
      metadata: { scope, kind, modality, source, target },
    })
  }

  revalidatePath('/settings/vocabulary')
  return { error: null, saved: true }
}

// ─── deleteVocabularyEntry ───────────────────────────────────────────────────
export async function deleteVocabularyEntry(
  _prev: VocabFormState,
  formData: FormData,
): Promise<VocabFormState> {
  const user = await requireCurrentUser()
  if (!canReview(user.role)) return { error: 'Permission refusée.' }

  const id = str(formData, 'id')
  if (!id) return { error: 'Identifiant manquant.' }

  const supabase = await createClient()
  // RLS guarantees a radiologist can only delete their own personal rows, and
  // clinic-wide rows only if they are an admin.
  const { error } = await supabase.from('vocabulary_entries').delete().eq('id', id)
  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'vocabulary.deleted', entityType: 'vocabulary_entry', entityId: id,
  })

  revalidatePath('/settings/vocabulary')
  return { error: null }
}

// ─── promoteVocabularyEntry ──────────────────────────────────────────────────
// Copy a personal entry into the clinic-wide shared dictionary (admins only).
export async function promoteVocabularyEntry(
  _prev: VocabFormState,
  formData: FormData,
): Promise<VocabFormState> {
  const user = await requireCurrentUser()
  if (!isAdmin(user.role)) {
    return { error: 'Seul un administrateur peut partager un terme avec la clinique.' }
  }

  const id = str(formData, 'id')
  if (!id) return { error: 'Identifiant manquant.' }

  const supabase = await createClient()
  const { data: src, error: readErr } = await supabase
    .from('vocabulary_entries')
    .select('kind, modality, source_text, target_text')
    .eq('id', id)
    .single()
  if (readErr || !src) return { error: 'Terme introuvable.' }

  const row = src as unknown as Record<string, unknown>
  const source = row.source_text as string
  const target = row.target_text as string
  if (changesClinicalMeaning(source, target)) {
    return { error: 'Partage refusé : ce terme modifierait le sens clinique.' }
  }

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .insert({
      clinic_id:    user.clinicId,
      user_id:      null,
      kind:         row.kind as string,
      modality:     (row.modality as string | null) ?? null,
      source_text:  source,
      target_text:  target,
      frequency:    1,
      confidence:   vocabularyConfidence(1),
      last_used_at: new Date().toISOString(),
      created_by:   user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'vocabulary.promoted', entityType: 'vocabulary_entry', entityId: data.id as string,
    metadata: { fromId: id, source, target },
  })

  revalidatePath('/settings/vocabulary')
  return { error: null, saved: true }
}
