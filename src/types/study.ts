export type Modality =
  | 'CT'   // Computed Tomography
  | 'MRI'  // Magnetic Resonance Imaging
  | 'XR'   // X-Ray
  | 'US'   // Ultrasound
  | 'NM'   // Nuclear Medicine
  | 'PT'   // PET Scan
  | 'MG'   // Mammography
  | 'DX'   // Digital Radiography
  | 'CR'   // Computed Radiography

export type StudyPriority = 'routine' | 'urgent' | 'stat'

export type StudyStatus = 'pending' | 'in_review' | 'reported' | 'validated' | 'cancelled'

export interface Study {
  id: string
  accessionNumber: string
  patientId: string
  clinicId: string
  modality: Modality
  bodyPart: string
  description: string
  studyDate: string          // ISO date — YYYY-MM-DD
  referringPhysician: string
  priority: StudyPriority
  status: StudyStatus
  hasReport: boolean
  createdAt: string
  updatedAt: string
}
