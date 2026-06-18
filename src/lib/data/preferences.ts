import { createClient } from '@/lib/supabase/server'
import type { UserPhrasePreference, PreferenceSection } from '@/types/preference'

function mapPref(row: Record<string, unknown>): UserPhrasePreference {
  return {
    id:         row.id as string,
    userId:     row.user_id as string,
    clinicId:   row.clinic_id as string,
    examType:   (row.exam_type as string | null) ?? undefined,
    section:    row.section as PreferenceSection,
    label:      (row.label as string | null) ?? undefined,
    phraseText: row.phrase_text as string,
    useCount:   (row.use_count as number) ?? 0,
    createdAt:  row.created_at as string,
  }
}

export async function getUserPhrases(opts?: {
  examType?: string
  section?:  PreferenceSection
}): Promise<UserPhrasePreference[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('user_phrase_preferences')
    .select('id, user_id, clinic_id, exam_type, section, label, phrase_text, use_count, created_at')
    .eq('user_id', user.id)
    .order('use_count', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.section)   query = query.eq('section', opts.section)
  if (opts?.examType) {
    // Include both exact exam type matches AND generic (null) preferences
    query = query.or(`exam_type.eq.${opts.examType},exam_type.is.null`)
  }

  const { data } = await query
  return (data ?? []).map(mapPref)
}
