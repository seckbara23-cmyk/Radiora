// F11 — read access to the signed-in radiologist's own profile.
//
// RLS already lets a user read their own profile row, so this uses the session
// client. Best-effort on the F11 columns: if migration 026 has not been applied
// yet the extra fields fall back to sensible defaults.

import { createClient } from '@/lib/supabase/server'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { buildSignatureName, coerceSignatureStyle } from '@/lib/profile/signature'
import type { RadiologistProfile } from '@/types/profile'

const SELECT_COLS =
  'id, first_name, last_name, email, specialty, license_number, signature_title, ' +
  'title_prefix, signature_style, signature_custom, phone, institution, country'

function toProfile(row: Record<string, unknown>): RadiologistProfile {
  return {
    id:              row.id as string,
    firstName:       (row.first_name as string) ?? '',
    lastName:        (row.last_name as string) ?? '',
    email:           (row.email as string) ?? '',
    titlePrefix:     (row.title_prefix as string) || 'Dr',
    signatureStyle:  coerceSignatureStyle(row.signature_style as string | null),
    signatureCustom: (row.signature_custom as string) ?? '',
    signatureTitle:  (row.signature_title as string) ?? '',
    specialty:       (row.specialty as string) ?? '',
    licenseNumber:   (row.license_number as string) ?? '',
    phone:           (row.phone as string) ?? '',
    institution:     (row.institution as string) ?? '',
    country:         (row.country as string) ?? '',
  }
}

export async function getMyProfile(): Promise<RadiologistProfile> {
  const user = await requireCurrentUser()
  const supabase = await createClient()

  try {
    const { data } = await supabase
      .from('profiles')
      .select(SELECT_COLS)
      .eq('id', user.id)
      .maybeSingle()
    if (data) return toProfile(data as unknown as Record<string, unknown>)
  } catch {
    // table/columns not yet migrated — fall through to a minimal profile
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    titlePrefix: 'Dr',
    signatureStyle: 'full',
    signatureCustom: '',
    signatureTitle: '',
    specialty: user.specialty ?? '',
    licenseNumber: user.licenseNumber ?? '',
    phone: '',
    institution: '',
    country: '',
  }
}

// The auto-inserted signature line + professional title for a report's author.
// Used by the printable view (the report author may differ from the viewer;
// RLS still permits reading clinic colleagues' profiles). Returns null on miss.
export async function getRadiologistSignature(
  userId: string,
): Promise<{ name: string; title: string } | null> {
  const supabase = await createClient()
  try {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, signature_title, title_prefix, signature_style, signature_custom')
      .eq('id', userId)
      .maybeSingle()
    if (!data) return null
    const row = data as Record<string, string | null>
    const name = buildSignatureName({
      titlePrefix: row.title_prefix || 'Dr',
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      style: coerceSignatureStyle(row.signature_style),
      custom: row.signature_custom ?? '',
    })
    return { name, title: row.signature_title ?? '' }
  } catch {
    return null
  }
}
