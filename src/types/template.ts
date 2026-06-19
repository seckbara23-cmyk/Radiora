export interface Template {
  id: string
  clinicId: string
  title: string
  modality: string | null
  bodyPart: string | null
  /** HPD INDICATION section (default/boilerplate). */
  indicationTemplate: string
  /** HPD TECHNIQUE section (default/boilerplate). */
  techniqueTemplate: string
  findingsTemplate: string
  impressionTemplate: string
  recommendationsTemplate: string
  /** Optional link to exam_catalog.exam_type (slug). */
  examType: string | null
  /** Provenance: manual | import:docx | import:paste | seed:dr-ba. */
  source: string | null
  isActive: boolean
  createdBy: string | null
  /** True for templates created by and visible only to their personalAuthorId */
  isPersonal: boolean
  personalAuthorId: string | null
  createdAt: string
  updatedAt: string
}
