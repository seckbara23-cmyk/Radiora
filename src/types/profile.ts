import type { SignatureStyle } from '@/lib/profile/signature'

// F11 — the editable radiologist profile (identity + signature preferences).
export interface RadiologistProfile {
  id: string
  firstName: string
  lastName: string
  email: string
  titlePrefix: string // 'Dr' | 'Pr'
  signatureStyle: SignatureStyle
  signatureCustom: string
  signatureTitle: string // professional title line, e.g. "Médecin Radiologue"
  specialty: string
  licenseNumber: string
  phone: string
  institution: string
  country: string
}
