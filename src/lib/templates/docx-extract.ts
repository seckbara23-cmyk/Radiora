// F16 — DOCX → plain text extraction.
//
// Reads the main document part of a .docx (which is just a ZIP of XML) and
// returns clean paragraph text, discarding all the Word markup, drawings and
// embedded VML/base64 blobs. Server-only: depends on jszip (no browser bundle).
//
// We extract ONLY the visible run text (<w:t>), inserting a newline per
// paragraph (<w:p>) and a tab per <w:tab/>. Everything else (formatting, shapes,
// graphics, base64) lives in tags/attributes and is dropped — so the result is
// the words a human typed, nothing else. No AI, no IO beyond the provided bytes.

import JSZip from 'jszip'

// Drawing / shape subtrees carry numeric element text (position offsets, extents)
// that would otherwise leak into the output as junk like "-11430014097000".
function stripDrawings(s: string): string {
  return s
    .replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/g, '')
    .replace(/<w:drawing[\s\S]*?<\/w:drawing>/g, '')
    .replace(/<w:pict[\s\S]*?<\/w:pict>/g, '')
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')        // strip every remaining tag
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Extract clean paragraph text from .docx bytes. Returns '' if not a docx. */
export async function extractDocxText(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    return ''
  }

  const doc = zip.file('word/document.xml')
  if (!doc) return ''

  const xml = await doc.async('string')
  // Keep only the body, then normalise structural tags before stripping the rest.
  const bodyMatch = xml.match(/<w:body[\s\S]*?<\/w:body>/)
  const body = bodyMatch ? bodyMatch[0] : xml

  const text = decodeXmlEntities(body)

  return text
    .split('\n')
    .map((l) => l.replace(/\t+/g, ' ').replace(/[  ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')      // collapse runs of blank lines
    .trim()
}
