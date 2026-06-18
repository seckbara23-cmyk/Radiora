export type ClinicStatus = 'active' | 'trial' | 'suspended' | 'inactive'

export type ClinicPlan = 'starter' | 'professional' | 'enterprise'

export interface Clinic {
  id: string
  name: string
  slug: string               // URL-safe identifier for multi-tenant routing
  address: string
  city: string
  state: string
  country: string
  phone: string
  email: string
  status: ClinicStatus
  plan: ClinicPlan
  userCount: number
  // Optional report branding (Feature 9). Storage path in clinic-branding bucket
  // or external https URL; null/empty → renderer falls back to plain text.
  logoUrl?: string
  departmentName?: string
  website?: string
  reportHeader?: string
  createdAt: string
  updatedAt: string
}
