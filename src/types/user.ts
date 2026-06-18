// Roles ordered from broadest to narrowest permissions
export type UserRole =
  | 'super_admin'          // Platform-level — cross-clinic access
  | 'clinic_admin'         // Clinic-level management
  | 'radiologist'          // Creates and signs reports
  | 'secretary'            // Uploads/matches audio, reviews transcription, routes to radiologist
  | 'technician'           // Uploads and manages studies
  | 'referring_physician'  // Read-only access to own patients
  | 'viewer'               // Read-only observer

export interface User {
  id: string
  clinicId: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  specialty?: string       // e.g. "Neuroradiology", "Musculoskeletal"
  licenseNumber?: string
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}
