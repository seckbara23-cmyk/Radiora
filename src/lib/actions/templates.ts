'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { logAudit } from '@/lib/actions/audit'

export type FormState = { error: string | null; saved?: boolean }

const TEMPLATE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const
type TemplateRole = typeof TEMPLATE_ROLES[number]

export async function saveTemplate(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!TEMPLATE_ROLES.includes(user.role as TemplateRole)) {
    return { error: 'You do not have permission to manage templates.' }
  }

  const id                      = (formData.get('id')                       as string | null)?.trim() || null
  const title                   = ((formData.get('title')                   as string) ?? '').trim()
  const modality                = ((formData.get('modality')                as string) ?? '').trim() || null
  const bodyPart                = ((formData.get('body_part')               as string) ?? '').trim() || null
  const indicationTemplate      = ((formData.get('indication_template')     as string) ?? '').trim()
  const techniqueTemplate       = ((formData.get('technique_template')      as string) ?? '').trim()
  const examType                = ((formData.get('exam_type')               as string) ?? '').trim() || null
  const findingsTemplate        = ((formData.get('findings_template')       as string) ?? '').trim()
  const impressionTemplate      = ((formData.get('impression_template')     as string) ?? '').trim()
  const recommendationsTemplate = ((formData.get('recommendations_template') as string) ?? '').trim()

  if (!title)               return { error: 'Title is required.' }
  if (!findingsTemplate)    return { error: 'Findings template is required.' }
  if (!impressionTemplate)  return { error: 'Impression template is required.' }

  const supabase = await createClient()

  if (id) {
    const { error } = await supabase
      .from('report_templates')
      .update({
        title,
        modality,
        body_part:               bodyPart,
        indication_template:     indicationTemplate,
        technique_template:      techniqueTemplate,
        exam_type:               examType,
        findings_template:       findingsTemplate,
        impression_template:     impressionTemplate,
        recommendations_template: recommendationsTemplate,
      })
      .eq('id', id)

    if (error) return { error: error.message }

    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'template.updated', entityType: 'template', entityId: id,
      metadata: { title },
    })
  } else {
    const { data, error } = await supabase
      .from('report_templates')
      .insert({
        clinic_id:               user.clinicId,
        title,
        modality,
        body_part:               bodyPart,
        indication_template:     indicationTemplate,
        technique_template:      techniqueTemplate,
        exam_type:               examType,
        findings_template:       findingsTemplate,
        impression_template:     impressionTemplate,
        recommendations_template: recommendationsTemplate,
        source:                  'manual',
        created_by:              user.id,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    await logAudit({
      userId: user.id, clinicId: user.clinicId,
      action: 'template.created', entityType: 'template', entityId: data.id,
      metadata: { title },
    })
  }

  revalidatePath('/templates')
  redirect('/templates')
}

export async function toggleTemplate(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCurrentUser()

  if (!TEMPLATE_ROLES.includes(user.role as TemplateRole)) {
    return { error: 'You do not have permission to manage templates.' }
  }

  const id       = ((formData.get('id')       as string) ?? '').trim()
  const activate = formData.get('activate') === '1'

  if (!id) return { error: 'Missing template ID.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('report_templates')
    .update({ is_active: activate })
    .eq('id', id)

  if (error) return { error: error.message }

  await logAudit({
    userId: user.id, clinicId: user.clinicId,
    action: activate ? 'template.activated' : 'template.deactivated',
    entityType: 'template', entityId: id,
  })

  revalidatePath('/templates')
  return { error: null }
}
