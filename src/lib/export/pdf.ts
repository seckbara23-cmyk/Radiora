// Feature 9 — PDF renderer (pdf-lib, pure server-side, no headless browser).
//
// Consumes ONLY a ReportExportModel (+ optional branding images). Produces an A4,
// French-first radiology report matching the Senegal/HPD template: hospital
// letterhead, patient identity box, centered underlined exam title, the fixed
// INDICATION → TECHNIQUE → RÉSULTATS → CONCLUSION sections, and a bottom-right
// signature block. Draft reports carry a diagonal BROUILLON watermark.

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import type { ReportExportModel } from './model'

export interface ExportImages {
  logo?: { bytes: Uint8Array; mime: string }
  signature?: { bytes: Uint8Array; mime: string }
  stamp?: { bytes: Uint8Array; mime: string }
}

// A4 in points.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56 // ~20mm
const CONTENT_W = PAGE_W - MARGIN * 2

const INK = rgb(0.07, 0.07, 0.07)
const GRAY = rgb(0.33, 0.33, 0.33)
const RULE = rgb(0.07, 0.07, 0.07)
const BOX = rgb(0.55, 0.55, 0.55)
const WATERMARK = rgb(0.85, 0.85, 0.85)

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  y: number
  font: PDFFont
  bold: PDFFont
  model: ReportExportModel
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H])
  ctx.y = PAGE_H - MARGIN
  paintWatermark(ctx)
}

function paintWatermark(ctx: Ctx): void {
  if (!ctx.model.watermark) return
  const size = 90
  const text = ctx.model.watermark
  const w = ctx.bold.widthOfTextAtSize(text, size)
  // Anchor so the rotated text runs corner-to-corner roughly centered.
  ctx.page.drawText(text, {
    x: PAGE_W / 2 - (w / 2) * Math.cos(Math.PI / 4) - 40,
    y: PAGE_H / 2 - (w / 2) * Math.sin(Math.PI / 4),
    size,
    font: ctx.bold,
    color: WATERMARK,
    rotate: degrees(45),
    opacity: 0.6,
  })
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 60) newPage(ctx)
}

function embedImage(doc: PDFDocument, img: { bytes: Uint8Array; mime: string }): Promise<PDFImage> {
  return img.mime.includes('png') ? doc.embedPng(img.bytes) : doc.embedJpg(img.bytes)
}

// Greedy word-wrap into lines that fit maxWidth.
function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

// Draw one justified line by distributing slack between words (last line / single
// word lines are left-aligned).
function drawJustifiedLine(
  ctx: Ctx,
  line: string,
  x: number,
  size: number,
  maxWidth: number,
  justify: boolean,
): void {
  const words = line.split(' ')
  if (!justify || words.length === 1) {
    ctx.page.drawText(line, { x, y: ctx.y, size, font: ctx.font, color: INK })
    return
  }
  const wordsWidth = words.reduce((sum, w) => sum + ctx.font.widthOfTextAtSize(w, size), 0)
  const gap = (maxWidth - wordsWidth) / (words.length - 1)
  let cursor = x
  for (const word of words) {
    ctx.page.drawText(word, { x: cursor, y: ctx.y, size, font: ctx.font, color: INK })
    cursor += ctx.font.widthOfTextAtSize(word, size) + gap
  }
}

function drawBody(ctx: Ctx, text: string, size = 10.5, lineHeight = 16.5): void {
  const paragraphs = text.split('\n')
  paragraphs.forEach((para, pIdx) => {
    if (!para.trim()) {
      ctx.y -= lineHeight * 0.6
      return
    }
    const lines = wrapParagraph(para.trim(), ctx.font, size, CONTENT_W)
    lines.forEach((line, i) => {
      ensureSpace(ctx, lineHeight)
      const isLast = i === lines.length - 1
      drawJustifiedLine(ctx, line, MARGIN, size, CONTENT_W, !isLast)
      ctx.y -= lineHeight
    })
    if (pIdx < paragraphs.length - 1) ctx.y -= 2
  })
}

export async function renderReportPdf(
  model: ReportExportModel,
  images: ExportImages = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(model.examTitle)
  doc.setProducer('Radiora')
  doc.setCreator('Radiora')

  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN, font, bold, model }
  paintWatermark(ctx)

  // ── Header / letterhead ── (omitted entirely for the "classic" model)
  if (model.header.hospital) {
    let headerTextX = MARGIN
    if (images.logo) {
      try {
        const logo = await embedImage(doc, images.logo)
        const h = 46
        const w = (logo.width / logo.height) * h
        ctx.page.drawImage(logo, { x: MARGIN, y: ctx.y - h + 6, width: w, height: h })
        headerTextX = MARGIN + w + 14
      } catch {
        /* bad image bytes — fall back to text-only header */
      }
    }

    if (model.header.overline) {
      ctx.page.drawText(model.header.overline, { x: headerTextX, y: ctx.y - 4, size: 8, font, color: GRAY })
      ctx.y -= 11
    }
    ctx.page.drawText(model.header.hospital.toUpperCase(), {
      x: headerTextX,
      y: ctx.y - 4,
      size: 13,
      font: bold,
      color: INK,
    })
    ctx.y -= 18
    if (model.header.department) {
      ctx.page.drawText(model.header.department, { x: headerTextX, y: ctx.y - 4, size: 9.5, font, color: GRAY })
      ctx.y -= 13
    }
    if (model.header.subtitle) {
      ctx.page.drawText(model.header.subtitle, { x: headerTextX, y: ctx.y - 4, size: 8, font, color: GRAY })
      ctx.y -= 11
    }
    if (model.header.address) {
      ctx.page.drawText(model.header.address, { x: headerTextX, y: ctx.y - 4, size: 8, font, color: GRAY })
      ctx.y -= 11
    }
    if (model.header.contact) {
      ctx.page.drawText(model.header.contact, { x: headerTextX, y: ctx.y - 4, size: 8, font, color: GRAY })
      ctx.y -= 11
    }
    ctx.y -= 6
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_W - MARGIN, y: ctx.y },
      thickness: 1.5,
      color: RULE,
    })
    ctx.y -= 18
  }

  // ── Patient identity box (two columns) ──
  const rows = Math.ceil(model.patientFields.length / 2)
  const rowH = 16
  const boxH = rows * rowH + 8
  const boxTop = ctx.y
  ctx.page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxH,
    width: CONTENT_W,
    height: boxH,
    borderColor: BOX,
    borderWidth: 1,
  })
  const colW = CONTENT_W / 2
  model.patientFields.forEach((f, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const fx = MARGIN + 8 + col * colW
    const fy = boxTop - 14 - row * rowH
    ctx.page.drawText(`${f.label} :`, { x: fx, y: fy, size: 9, font: bold, color: INK })
    const labelW = bold.widthOfTextAtSize(`${f.label} :`, 9)
    ctx.page.drawText(f.value, { x: fx + labelW + 6, y: fy, size: 9, font, color: INK })
  })
  ctx.y = boxTop - boxH - 24

  // ── Exam title (centered, underlined) ──
  const titleSize = 14
  const titleW = bold.widthOfTextAtSize(model.examTitle, titleSize)
  const titleX = (PAGE_W - titleW) / 2
  ctx.page.drawText(model.examTitle, { x: titleX, y: ctx.y, size: titleSize, font: bold, color: INK })
  ctx.page.drawLine({
    start: { x: titleX, y: ctx.y - 3 },
    end: { x: titleX + titleW, y: ctx.y - 3 },
    thickness: 0.8,
    color: INK,
  })
  ctx.y -= 30

  // ── Sections (fixed order, guaranteed by the model) ──
  for (const section of model.sections) {
    ensureSpace(ctx, 40)
    ctx.page.drawText(`${section.label} :`, { x: MARGIN, y: ctx.y, size: 11, font: bold, color: INK })
    const lblW = bold.widthOfTextAtSize(`${section.label} :`, 11)
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y - 2.5 },
      end: { x: MARGIN + lblW, y: ctx.y - 2.5 },
      thickness: 0.6,
      color: INK,
    })
    ctx.y -= 17
    drawBody(ctx, section.body)
    ctx.y -= 12
  }

  // ── Signature block (bottom-right) ──
  ctx.y -= 16
  ensureSpace(ctx, 110)
  const sig = model.signature
  const blockW = 220
  const blockX = PAGE_W - MARGIN - blockW
  let sigY = ctx.y

  if (sig.signedDate) {
    ctx.page.drawText(`Fait à Dakar, le ${sig.signedDate}`, {
      x: blockX,
      y: sigY,
      size: 9.5,
      font,
      color: GRAY,
    })
    sigY -= 18
  }

  // Signature image (if configured) sits above the name.
  if (images.signature) {
    try {
      const sigImg = await embedImage(doc, images.signature)
      const h = 42
      const w = Math.min((sigImg.width / sigImg.height) * h, blockW)
      ctx.page.drawImage(sigImg, { x: blockX, y: sigY - h, width: w, height: h })
      sigY -= h + 4
    } catch {
      /* ignore bad signature image */
    }
  }

  ctx.page.drawText(sig.name, { x: blockX, y: sigY, size: 11, font: bold, color: INK })
  sigY -= 14
  if (sig.title) {
    ctx.page.drawText(sig.title, { x: blockX, y: sigY, size: 9.5, font, color: GRAY })
    sigY -= 14
  }

  // Stamp (if configured) to the left of the signature.
  if (images.stamp) {
    try {
      const stampImg = await embedImage(doc, images.stamp)
      const h = 70
      const w = (stampImg.width / stampImg.height) * h
      ctx.page.drawImage(stampImg, { x: MARGIN, y: ctx.y - h, width: w, height: h, opacity: 0.9 })
    } catch {
      /* ignore bad stamp image */
    }
  }

  return doc.save()
}
