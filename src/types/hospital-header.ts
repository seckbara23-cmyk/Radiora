// F12 — Hospital Header Library.

export interface HospitalHeader {
  id: string
  /** null = global seed shared with every clinic. */
  clinicId: string | null
  name: string
  overline: string
  department: string
  subtitle: string
  address: string
  phone: string
  email: string
  logoUrl: string | null
  isActive: boolean
  sortOrder: number
}
