export interface Template {
  id: string
  clinicId: string
  title: string
  modality: string | null
  bodyPart: string | null
  findingsTemplate: string
  impressionTemplate: string
  recommendationsTemplate: string
  isActive: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}
