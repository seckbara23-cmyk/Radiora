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
  /** True for templates created by and visible only to their personalAuthorId */
  isPersonal: boolean
  personalAuthorId: string | null
  createdAt: string
  updatedAt: string
}
