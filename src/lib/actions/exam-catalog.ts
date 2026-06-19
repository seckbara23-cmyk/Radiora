'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'
import { slugifyExam } from '@/config/exam-catalog'
import { MODALITY_ORDER, type ExamModality } from '@/types/exam'

export type FormState = { error: string | null; saved?: boolean }

const MANAGE_ROLES = ['super_admin', 'clinic_admin'] as const
type ManageRole = typeof MANAGE_ROLES[number]

/** Add a clinic-specific exam to the catalog (admins only). */
export async function addCustomExam(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'Seuls les administrateurs peuvent modifier le catalogue.' }
  }
  if (!user.clinicId) {
    return { error: 'Aucune clinique associée à ce compte.' }
  }

  const title    = ((formData.get('title') as string) ?? '').trim()
  const modality = ((formData.get('modality') as string) ?? '').trim() as ExamModality
  const technique = ((formData.get('default_technique') as string) ?? '').trim()

  if (!title) return { error: "Le libellé de l'examen est requis." }
  if (!MODALITY_ORDER.includes(modality)) return { error: 'Modalité invalide.' }

  const examType = slugifyExam(title)
  if (!examType) return { error: "Le libellé de l'examen est invalide." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exam_catalog')
    .insert({
      clinic_id:         user.clinicId,
      modality,
      title:             title.toUpperCase(),
      exam_type:         examType,
      default_technique: technique,
      created_by:        user.id,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Cet examen existe déjà dans votre catalogue.' }
    return { error: error.message }
  }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: 'exam_catalog.created', entityType: 'exam_catalog', entityId: data.id,
    metadata: { title, modality },
  })

  revalidatePath('/settings/exams')
  return { error: null, saved: true }
}

/** Activate / deactivate a clinic custom exam (admins only). */
export async function toggleCustomExam(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!MANAGE_ROLES.includes(user.role as ManageRole)) {
    return { error: 'Seuls les administrateurs peuvent modifier le catalogue.' }
  }

  const id       = ((formData.get('id') as string) ?? '').trim()
  const activate = formData.get('activate') === '1'
  if (!id) return { error: "Identifiant d'examen manquant." }

  const supabase = await createClient()
  const { error } = await supabase
    .from('exam_catalog')
    .update({ is_active: activate })
    .eq('id', id)

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: activate ? 'exam_catalog.activated' : 'exam_catalog.deactivated',
    entityType: 'exam_catalog', entityId: id,
  })

  revalidatePath('/settings/exams')
  return { error: null }
}
