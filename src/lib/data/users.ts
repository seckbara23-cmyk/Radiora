import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/user'

export interface ClinicUser {
  id: string
  email: string | null
  firstName: string
  lastName: string
  role: UserRole
  specialty: string | null
  licenseNumber: string | null
  isActive: boolean
  createdAt: string
}

export async function getClinicUsers(): Promise<ClinicUser[]> {
  const supabase = await createClient()

  // RLS enforces clinic isolation:
  //   • clinic_admin sees only profiles where clinic_id = their clinic_id
  //   • super_admin sees all profiles (via "profiles: super_admin all" policy)
  //   • other roles see only their own profile (not useful here — pages must
  //     guard access before calling this function)
  const { data } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role, specialty, license_number, is_active, created_at')
    .order('last_name',  { ascending: true })
    .order('first_name', { ascending: true })

  return (data ?? []).map((row) => ({
    id:            row.id as string,
    email:         (row.email as string | null) ?? null,
    firstName:     row.first_name as string,
    lastName:      row.last_name as string,
    role:          row.role as UserRole,
    specialty:     (row.specialty as string | null) ?? null,
    licenseNumber: (row.license_number as string | null) ?? null,
    isActive:      row.is_active as boolean,
    createdAt:     row.created_at as string,
  }))
}
