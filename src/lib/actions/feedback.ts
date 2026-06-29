'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  type FeedbackCategory,
  type FeedbackPriority,
} from '@/types/pilot'

export type FeedbackFormState = { error: string | null; submitted?: boolean }

// Phase 6A.5 — a pilot user submits in-app feedback. Carries no clinical data.
// RLS pins the row to the caller's own clinic and identity; we mirror that here.
export async function submitFeedback(
  _prev: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const user = await requireCurrentUser()
  if (!user.clinicId) {
    return { error: 'Aucune clinique associée à votre compte.' }
  }

  const category = String(formData.get('category') ?? '') as FeedbackCategory
  const priority = String(formData.get('priority') ?? '') as FeedbackPriority
  const message = String(formData.get('message') ?? '').trim()

  if (!FEEDBACK_CATEGORIES.includes(category)) return { error: 'Catégorie invalide.' }
  if (!FEEDBACK_PRIORITIES.includes(priority)) return { error: 'Priorité invalide.' }
  if (message.length < 3) return { error: 'Merci de décrire votre retour.' }
  if (message.length > 4000) return { error: 'Message trop long (4000 caractères max).' }

  const supabase = await createClient()
  const { error } = await supabase.from('pilot_feedback').insert({
    clinic_id: user.clinicId,
    user_id: user.id,
    category,
    priority,
    message,
  })
  if (error) return { error: error.message }

  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'pilot.feedback_submitted',
    entityType: 'pilot_feedback',
    entityId: user.id,
    metadata: { category, priority },
  })

  revalidatePath('/feedback')
  revalidatePath('/pilot')
  return { error: null, submitted: true }
}
