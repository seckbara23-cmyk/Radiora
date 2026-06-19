// F12 — read access to the hospital-header library.
//
// Reads go through the user-session client so RLS returns exactly the headers the
// caller may see: global seeds + their own clinic's headers. Best-effort: if the
// table is missing (migration not yet applied) callers get an empty list and the
// export simply falls back to the clinic's default letterhead.

import { createClient } from '@/lib/supabase/server'
import type { HospitalHeader } from '@/types/hospital-header'

const SELECT_COLS =
  'id, clinic_id, name, overline, department, subtitle, address, phone, email, logo_url, is_active, sort_order'

function toHeader(row: Record<string, unknown>): HospitalHeader {
  return {
    id:         row.id as string,
    clinicId:   (row.clinic_id as string | null) ?? null,
    name:       (row.name as string) ?? '',
    overline:   (row.overline as string) ?? '',
    department: (row.department as string) ?? '',
    subtitle:   (row.subtitle as string) ?? '',
    address:    (row.address as string) ?? '',
    phone:      (row.phone as string) ?? '',
    email:      (row.email as string) ?? '',
    logoUrl:    (row.logo_url as string | null) ?? null,
    isActive:   (row.is_active as boolean) ?? true,
    sortOrder:  (row.sort_order as number) ?? 0,
  }
}

export async function getHospitalHeaders(opts?: { activeOnly?: boolean }): Promise<HospitalHeader[]> {
  const supabase = await createClient()
  let query = supabase
    .from('hospital_headers')
    .select(SELECT_COLS)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (opts?.activeOnly) query = query.eq('is_active', true)

  try {
    const { data, error } = await query
    if (error) return []
    return (data ?? []).map(toHeader)
  } catch {
    return []
  }
}

export async function getHospitalHeader(id: string): Promise<HospitalHeader | null> {
  const supabase = await createClient()
  try {
    const { data } = await supabase
      .from('hospital_headers')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle()
    return data ? toHeader(data) : null
  } catch {
    return null
  }
}
