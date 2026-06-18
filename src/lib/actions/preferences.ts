'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import type { PreferenceSection } from '@/types/preference'

export type PrefResult = { error: string | null }

const ALLOWED_SECTIONS: PreferenceSection[] = ['technique', 'conclusion', 'indication', 'recommendations']

// 'results' (diagnostic findings) is intentionally excluded — must not be auto-suggested.
function isSectionAllowed(section: string): section is PreferenceSection {
  return ALLOWED_SECTIONS.includes(section as PreferenceSection)
}

// ─── saveUserPhrase ───────────────────────────────────────────────────────────
// Saves a radiologist's preferred phrase for a given section + exam type.
// The phrase is always typed by the physician — never auto-generated.

export async function saveUserPhrase(
  section:    PreferenceSection,
  phraseText: string,
  opts?: {
    examType?: string
    label?:    string
    reportId?: string
  }
): Promise<PrefResult & { id?: string }> {
  const user = await requireCurrentUser()

  if (!isSectionAllowed(section)) {
    return { error: 'Diagnostic findings cannot be saved as preferences for safety reasons.' }
  }

  const text = phraseText.trim()
  if (!text) return { error: 'Phrase cannot be empty.' }
  if (text.length > 4000) return { error: 'Phrase is too long (max 4000 characters).' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_phrase_preferences')
    .insert({
      user_id:    user.id,
      clinic_id:  user.clinicId,
      exam_type:  opts?.examType ?? null,
      section,
      label:      opts?.label ?? null,
      phrase_text: text,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'preference.phrase_saved',
    entityType: 'user_phrase_preference',
    entityId:   data.id as string,
    metadata:   { section, examType: opts?.examType, reportId: opts?.reportId },
  })

  if (opts?.reportId) revalidatePath(`/reports/${opts.reportId}`)

  return { error: null, id: data.id as string }
}

// ─── deleteUserPhrase ─────────────────────────────────────────────────────────

export async function deleteUserPhrase(id: string): Promise<PrefResult> {
  const user = await requireCurrentUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('user_phrase_preferences')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)   // RLS enforced here too, belt-and-suspenders

  if (error) return { error: error.message }

  await logAudit({
    userId:     user.id,
    clinicId:   user.clinicId,
    action:     'preference.phrase_deleted',
    entityType: 'user_phrase_preference',
    entityId:   id,
    metadata:   {},
  })

  return { error: null }
}

// ─── incrementPhraseUse ────────────────────────────────────────────────────────
// Called whenever a saved phrase suggestion is applied.
// Drives the "most-used first" sort order.

export async function incrementPhraseUse(id: string): Promise<void> {
  try {
    // Ensure there is an authenticated session; the RPC derives the owner from
    // auth.uid() server-side and ignores any client-supplied identity.
    await requireCurrentUser()
    const supabase = await createClient()
    await supabase.rpc('increment_phrase_use', { phrase_id: id })
  } catch {
    // Non-critical — never block the editor flow.
  }
}
