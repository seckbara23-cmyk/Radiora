export type ReportStatus = 'draft' | 'in_review' | 'finalized' | 'amended'

export interface Report {
  id: string
  studyId: string
  patientId: string
  clinicId: string
  authorId: string           // references User.id
  status: ReportStatus
  findings: string
  impression: string
  recommendations?: string
  aiDraft?: string           // AI-generated initial draft — populated by future AI layer
  signedAt?: string          // ISO datetime — set on finalization
  createdAt: string
  updatedAt: string
}
