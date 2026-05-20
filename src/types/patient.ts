export type PatientSex = 'male' | 'female' | 'other' | 'unknown'

export type PatientStatus = 'active' | 'inactive' | 'deceased'

export interface Patient {
  id: string
  mrn: string
  firstName: string
  lastName: string
  dateOfBirth: string   // ISO date — YYYY-MM-DD
  sex: PatientSex
  email?: string
  phone?: string
  clinicId: string
  status: PatientStatus
  createdAt: string     // ISO datetime
  updatedAt: string
}

export type PatientWithName = Patient & { fullName: string }
