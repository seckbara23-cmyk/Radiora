// F16 — Template Importer: plain text → structured HPD sections.
//
// Pure, deterministic, no IO. Takes the text of a doctor's report model (one or
// more templates concatenated, as produced by extractDocxText or pasted by hand)
// and splits it into structured templates with the four canonical HPD sections:
// INDICATION, TECHNIQUE, RÉSULTATS, CONCLUSION.
//
// This NEVER invents clinical content. It only segments and labels text the
// author already wrote. Unrecognised lines are preserved in the current section
// verbatim. Signature lines (e.g. "Dr ABIBOU BA") are stripped from content but
// surfaced as `signature` so callers can decide what to do with them.

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

/** Best-effort modality from an exam title. Defaults to null (generic). */
export function guessModality(title: string): 'US' | 'CT' | 'MRI' | 'XR' | 'MG' | null {
  const n = norm(title)
  if (n.startsWith('echographie') || n.startsWith('echo') || n.includes('doppler')) return 'US'
  if (n.startsWith('irm')) return 'MRI'
  if (n.startsWith('mammographie')) return 'MG'
  if (n.startsWith('scanner') || n.startsWith('angioscanner') || n.startsWith('tdm') ||
      n.startsWith('uroscanner') || n.startsWith('coloscanner') || n.startsWith('entero')) return 'CT'
  if (n.startsWith('radiographie') || n.startsWith('rx') || n.includes('asp') ||
      n.startsWith('togd') || n.startsWith('uiv')) return 'XR'
  return null
}

export type TemplateSectionKey = 'indication' | 'technique' | 'results' | 'conclusion'

export interface ParsedTemplate {
  /** First non-empty line of the block — the exam title as written. */
  title: string
  indication: string
  technique: string
  results: string
  conclusion: string
  /** Signature line found in the block, if any (e.g. "Dr ABIBOU BA"). */
  signature?: string
}

// Section header keywords → canonical section. Longest/most-specific first so
// "EN CONCLUSION" wins over a bare "CONCLUSION" check.
const SECTION_MATCHERS: { key: TemplateSectionKey; re: RegExp }[] = [
  { key: 'indication', re: /^indication(?:\s+clinique)?\b/ },
  { key: 'technique', re: /^technique\b/ },
  { key: 'results', re: /^resultats?\b/ },
  { key: 'conclusion', re: /^(?:en\s+)?conclusion\b/ },
]

// Lines that are author signatures rather than clinical content.
const SIGNATURE_RE = /^(dr|pr|docteur|professeur)\b[.\s]/i

/** Returns the canonical section and the inline remainder after the header. */
function matchSectionHeader(line: string): { key: TemplateSectionKey; rest: string } | null {
  const n = norm(line)
  for (const { key, re } of SECTION_MATCHERS) {
    if (re.test(n)) {
      // Inline content (if any) follows the colon: "TECHNIQUE : acquisition …".
      // A header with no colon ("RESULTATS") carries its content on later lines.
      const colon = line.indexOf(':')
      const rest = (colon >= 0 ? line.slice(colon + 1) : '')
        .replace(/^\s*\([^)]*\)\s*:?\s*/u, '') // drop a leading "(mesure …)" note
        .trim()
      return { key, rest }
    }
  }
  return null
}

/**
 * Parse one template block (already split at signature boundaries) into sections.
 * Returns null if the block has no recognisable title.
 */
function parseBlock(block: string): ParsedTemplate | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null

  const sections: Record<TemplateSectionKey, string[]> = {
    indication: [],
    technique: [],
    results: [],
    conclusion: [],
  }

  let title = ''
  let signature: string | undefined
  let current: TemplateSectionKey | null = null

  for (const line of lines) {
    if (SIGNATURE_RE.test(line)) {
      signature = line
      continue
    }
    const header = matchSectionHeader(line)
    if (header) {
      current = header.key
      if (header.rest) sections[current].push(header.rest)
      continue
    }
    if (!title) {
      title = line
      continue
    }
    if (current) sections[current].push(line)
    // Lines before any section header (other than the title) are ignored as
    // stray formatting — we never guess which section they belong to.
  }

  if (!title) return null

  return {
    title,
    indication: sections.indication.join('\n').trim(),
    technique: sections.technique.join('\n').trim(),
    results: sections.results.join('\n').trim(),
    conclusion: sections.conclusion.join('\n').trim(),
    signature,
  }
}

/**
 * Split a document into template blocks and parse each.
 *
 * Blocks are delimited by signature lines (each Dr-BA model ends with the
 * doctor's name). If no signatures are present (e.g. a single pasted template),
 * the whole text is treated as one block.
 */
export function parseTemplateDocument(text: string): ParsedTemplate[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  const blocks: string[] = []
  let buf: string[] = []
  for (const line of lines) {
    buf.push(line)
    if (SIGNATURE_RE.test(line.trim())) {
      blocks.push(buf.join('\n'))
      buf = []
    }
  }
  if (buf.some((l) => l.trim().length > 0)) blocks.push(buf.join('\n'))

  return blocks
    .map(parseBlock)
    .filter((t): t is ParsedTemplate => t !== null && t.title.length > 0)
}
