// Feature 9 — DOCX renderer (docx package, pure server-side).
//
// Produces an EDITABLE Word document from the same ReportExportModel the PDF uses,
// so the layout, section order and content are identical across formats. Draft
// reports carry a BROUILLON header on every page.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  Header,
  ImageRun,
  type ISectionOptions,
} from 'docx'
import type { ReportExportModel } from './model'
import type { ExportImages } from './pdf'

// twips helpers (1 inch = 1440 twips; A4 = 210 × 297 mm).
const A4 = { width: 11906, height: 16838 }
const MARGIN = 1134 // ≈ 20mm
const INK = '111111'
const GRAY = '555555'
const BOXGRAY = '999999'

function imageType(mime: string): 'png' | 'jpg' {
  return mime.includes('png') ? 'png' : 'jpg'
}

function safeImageRun(
  img: { bytes: Uint8Array; mime: string } | undefined,
  width: number,
  height: number,
): ImageRun | null {
  if (!img) return null
  try {
    return new ImageRun({
      data: img.bytes,
      transformation: { width, height },
      type: imageType(img.mime),
    })
  } catch {
    return null
  }
}

function patientTable(model: ReportExportModel): Table {
  const rows: TableRow[] = []
  for (let i = 0; i < model.patientFields.length; i += 2) {
    const pair = [model.patientFields[i], model.patientFields[i + 1]]
    rows.push(
      new TableRow({
        children: pair.map(
          (f) =>
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              children: [
                new Paragraph({
                  children: f
                    ? [
                        new TextRun({ text: `${f.label} : `, bold: true, size: 18, color: INK }),
                        new TextRun({ text: f.value, size: 18, color: INK }),
                      ]
                    : [new TextRun({ text: '', size: 18 })],
                }),
              ],
            }),
        ),
      }),
    )
  }
  const border = { style: BorderStyle.SINGLE, size: 2, color: BOXGRAY }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows,
  })
}

function sectionParagraphs(model: ReportExportModel): Paragraph[] {
  const out: Paragraph[] = []
  for (const section of model.sections) {
    out.push(
      new Paragraph({
        spacing: { before: 180, after: 60 },
        children: [
          new TextRun({ text: `${section.label} :`, bold: true, underline: {}, size: 22, color: INK }),
        ],
      }),
    )
    for (const para of section.body.split('\n')) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 60, line: 300 },
          children: [new TextRun({ text: para.trim(), size: 21, color: INK })],
        }),
      )
    }
  }
  return out
}

function signatureParagraphs(model: ReportExportModel, images: ExportImages): Paragraph[] {
  const sig = model.signature
  const out: Paragraph[] = []
  out.push(new Paragraph({ spacing: { before: 360 }, children: [] }))
  if (sig.signedDate) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: `Fait à Dakar, le ${sig.signedDate}`, size: 19, color: GRAY })],
      }),
    )
  }
  const sigImg = safeImageRun(images.signature, 150, 44)
  if (sigImg) {
    out.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [sigImg] }))
  }
  out.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 80 },
      children: [new TextRun({ text: sig.name, bold: true, size: 22, color: INK })],
    }),
  )
  if (sig.title) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: sig.title, size: 19, color: GRAY })],
      }),
    )
  }
  return out
}

export async function renderReportDocx(
  model: ReportExportModel,
  images: ExportImages = {},
): Promise<Uint8Array> {
  const headerChildren: Paragraph[] = []

  // Letterhead — omitted entirely for the "classic" model (no header).
  if (model.header.hospital) {
    const logo = safeImageRun(images.logo, 120, 46)
    if (logo) headerChildren.push(new Paragraph({ children: [logo], spacing: { after: 40 } }))

    if (model.header.overline) {
      headerChildren.push(
        new Paragraph({ children: [new TextRun({ text: model.header.overline, size: 16, color: GRAY })] }),
      )
    }
    headerChildren.push(
      new Paragraph({
        children: [new TextRun({ text: model.header.hospital.toUpperCase(), bold: true, size: 26, color: INK })],
      }),
    )
    if (model.header.department) {
      headerChildren.push(
        new Paragraph({ children: [new TextRun({ text: model.header.department, size: 19, color: GRAY })] }),
      )
    }
    if (model.header.subtitle) {
      headerChildren.push(
        new Paragraph({ children: [new TextRun({ text: model.header.subtitle, size: 16, color: GRAY })] }),
      )
    }
    if (model.header.address) {
      headerChildren.push(
        new Paragraph({ children: [new TextRun({ text: model.header.address, size: 16, color: GRAY })] }),
      )
    }
    if (model.header.contact) {
      headerChildren.push(
        new Paragraph({ children: [new TextRun({ text: model.header.contact, size: 16, color: GRAY })] }),
      )
    }
    // Rule under the letterhead.
    headerChildren.push(
      new Paragraph({
        spacing: { after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 4 } },
        children: [],
      }),
    )
  }

  const titleParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 240 },
    children: [
      new TextRun({ text: model.examTitle, bold: true, underline: {}, size: 28, color: INK }),
    ],
  })

  const body: (Paragraph | Table)[] = [
    ...headerChildren,
    patientTable(model),
    titleParagraph,
    ...sectionParagraphs(model),
    ...signatureParagraphs(model, images),
  ]

  // BROUILLON watermark via a page header (shows on every page).
  const headers = model.watermark
    ? {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: model.watermark, bold: true, size: 56, color: 'D9D9D9' })],
            }),
          ],
        }),
      }
    : undefined

  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: A4.width, height: A4.height },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    ...(headers ? { headers } : {}),
    children: body,
  }

  const doc = new Document({
    creator: 'Radiora',
    title: model.examTitle,
    sections: [section],
  })

  const buffer = await Packer.toBuffer(doc)
  return new Uint8Array(buffer)
}
