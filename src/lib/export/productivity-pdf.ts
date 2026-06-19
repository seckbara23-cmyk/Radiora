// Phase 5G — Radiologist Productivity PDF.
//
// Renders the per-radiologist productivity report (report volume, exams
// interpreted, validation time, dictation time) as a clean A4 landscape table
// using pdf-lib — pure server-side, no headless browser. Carries operational
// metrics only: names, counts and durations, never any clinical content.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { RadiologistProductivityReport, RadiologistReportRow } from '@/lib/data/analytics'

// A4 landscape, in points.
const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 40

const INK = rgb(0.1, 0.1, 0.1)
const GRAY = rgb(0.4, 0.4, 0.4)
const RULE = rgb(0.1, 0.1, 0.1)
const HEAD = rgb(0.93, 0.93, 0.93)
const ZEBRA = rgb(0.97, 0.97, 0.97)

interface Column {
  label: string
  width: number
  align: 'left' | 'right'
  value: (r: RadiologistReportRow) => string
}

function minutesLabel(minutes: number): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function secondsLabel(seconds: number): string {
  if (!seconds) return '—'
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let s = text
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

export async function renderProductivityPdf(report: RadiologistProductivityReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Radiologist Productivity')
  doc.setProducer('Radiora')
  doc.setCreator('Radiora')

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const contentW = PAGE_W - MARGIN * 2
  const nameW = Math.round(contentW * 0.26)
  const metricW = (contentW - nameW) / 5

  const columns: Column[] = [
    { label: 'Radiologist',      width: nameW,   align: 'left',  value: (r) => `${r.firstName} ${r.lastName}`.trim() || '—' },
    { label: 'Report Volume',    width: metricW, align: 'right', value: (r) => String(r.reportVolume) },
    { label: 'Exams Interpreted', width: metricW, align: 'right', value: (r) => String(r.examsInterpreted) },
    { label: 'Finalized',        width: metricW, align: 'right', value: (r) => String(r.finalizedCount) },
    { label: 'Avg Validation',   width: metricW, align: 'right', value: (r) => minutesLabel(r.avgValidationMinutes) },
    { label: 'Dictation',        width: metricW, align: 'right', value: (r) => `${r.dictationSessions} · ${secondsLabel(r.dictationSeconds)}` },
  ]

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  // ── Title block ──
  page.drawText('Radiologist Productivity Report', { x: MARGIN, y: y - 4, size: 16, font: bold, color: INK })
  y -= 22
  const periodFrom = new Date(Date.parse(report.generatedAt) - report.dayRange * 86_400_000)
    .toISOString().slice(0, 10)
  const subtitle = [
    report.clinicName ?? (report.scope === 'self' ? 'Personal metrics' : 'All clinics'),
    `Period: ${periodFrom} → ${report.generatedAt.slice(0, 10)} (${report.dayRange} days)`,
    `Generated: ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC`,
  ].join('   ·   ')
  page.drawText(subtitle, { x: MARGIN, y: y - 4, size: 9, font, color: GRAY })
  y -= 16
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: RULE })
  y -= 6

  const rowH = 20
  const padX = 6

  const colX: number[] = []
  let cx = MARGIN
  for (const c of columns) { colX.push(cx); cx += c.width }

  const drawHeader = (): void => {
    page.drawRectangle({ x: MARGIN, y: y - rowH, width: contentW, height: rowH, color: HEAD })
    columns.forEach((c, i) => {
      const text = c.label
      const tw = bold.widthOfTextAtSize(text, 8.5)
      const x = c.align === 'right' ? colX[i] + c.width - padX - tw : colX[i] + padX
      page.drawText(text, { x, y: y - 14, size: 8.5, font: bold, color: INK })
    })
    y -= rowH
  }

  drawHeader()

  if (report.rows.length === 0) {
    y -= 4
    page.drawText('No report activity in this period.', { x: MARGIN + padX, y: y - 12, size: 10, font, color: GRAY })
  }

  report.rows.forEach((r, idx) => {
    if (y - rowH < MARGIN + 30) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
      drawHeader()
    }
    if (idx % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowH, width: contentW, height: rowH, color: ZEBRA })
    }
    columns.forEach((c, i) => {
      const raw = c.value(r)
      const text = truncate(raw, font, 9, c.width - padX * 2)
      const tw = font.widthOfTextAtSize(text, 9)
      const x = c.align === 'right' ? colX[i] + c.width - padX - tw : colX[i] + padX
      page.drawText(text, { x, y: y - 14, size: 9, font, color: INK })
    })
    y -= rowH
  })

  // ── Footer rule + note ──
  y -= 6
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: GRAY })
  y -= 12
  page.drawText('Operational metrics only — no clinical content. Generated by Radiora.', {
    x: MARGIN, y, size: 7.5, font, color: GRAY,
  })

  return doc.save()
}
