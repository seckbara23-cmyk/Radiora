export interface StructuredDraft {
  clinicalIndication: string
  technique: string
  findings: string
  impression: string
  recommendations: string
}

const SECTIONS = [
  { key: 'clinicalIndication' as const, patterns: ['clinical indication', 'indication', 'clinical history', 'history'] },
  { key: 'technique'          as const, patterns: ['technique', 'procedure', 'method'] },
  { key: 'findings'           as const, patterns: ['findings', 'observations', 'description'] },
  { key: 'impression'         as const, patterns: ['impression', 'assessment', 'conclusion', 'interpretation'] },
  { key: 'recommendations'   as const, patterns: ['recommendations', 'recommendation', 'follow-up', 'follow up'] },
]

const SECTION_PATTERN_LIST = SECTIONS.flatMap((s) => s.patterns)

export function mockStructureText(
  freeText: string,
  modality?: string | null,
  bodyPart?: string | null,
): StructuredDraft {
  const text = freeText.trim()

  const result: StructuredDraft = {
    clinicalIndication: '',
    technique: '',
    findings: '',
    impression: '',
    recommendations: '',
  }

  // Build split regex from all known headers
  const escapedHeaders = SECTION_PATTERN_LIST
    .map((p) => p.replace(/[-]/g, '[-]').replace(/\s+/g, '\\s+'))
    .join('|')
  const splitRe = new RegExp(`(?=\\b(?:${escapedHeaders})\\s*:)`, 'gi')

  const parts = text.split(splitRe).filter(Boolean)

  for (const part of parts) {
    for (const section of SECTIONS) {
      for (const pattern of section.patterns) {
        const escaped = pattern.replace(/[-]/g, '[-]').replace(/\s+/g, '\\s+')
        const headerRe = new RegExp(`^${escaped}\\s*:?\\s*`, 'i')
        if (headerRe.test(part)) {
          result[section.key] = part.replace(headerRe, '').trim()
          break
        }
      }
    }
  }

  // Fallback: no section headers found — split by sentences
  if (!result.findings && !result.impression) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
    const cutoff = Math.max(1, Math.ceil(sentences.length * 0.65))
    result.findings   = sentences.slice(0, cutoff).join(' ').trim()
    result.impression = sentences.slice(cutoff).join(' ').trim()
  }

  // Auto-generate technique from modality when not in the input text
  if (!result.technique && modality) {
    result.technique = buildTechnique(modality, bodyPart ?? null)
  }

  return result
}

function buildTechnique(modality: string, bodyPart: string | null): string {
  const body = bodyPart ? ` of the ${bodyPart.toLowerCase()}` : ''
  const mod  = modality.toUpperCase()
  const map: Record<string, string> = {
    CT:  `CT${body} performed with standard protocol.`,
    MRI: `MRI${body} performed with standard sequences including T1, T2, and FLAIR.`,
    XR:  `Radiograph${body} obtained in standard projections.`,
    CR:  `Radiograph${body} obtained in standard projections.`,
    US:  `Ultrasound${body} performed using high-frequency transducer.`,
    PET: `PET-CT${body} performed following standard radiopharmaceutical administration.`,
    NM:  `Nuclear medicine scintigraphy${body} performed.`,
    MG:  `Mammography performed bilaterally with standard CC and MLO views.`,
    DX:  `Digital radiograph${body} obtained.`,
    RF:  `Fluoroscopic examination${body} performed.`,
  }
  return map[mod] ?? `${mod}${body} performed.`
}
