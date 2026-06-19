// F18 — special structured exam forms: pure helpers.
//
// Turns a filled SpecialFormState into the artifacts every consumer needs:
//   • a flat presentation table for PDF / DOCX / print
//   • a plain-text rendering for the RÉSULTATS section (so validation and any
//     text-only consumer still see content)
//   • a required-field check for the editor
//
// PURE and deterministic. Never invents, computes or concludes — it only formats
// the measurements the radiologist typed. Empty cells render as an em dash.

import type { SpecialFormState } from '@/types/report'
import type { SpecialLayout } from '@/types/exam'
import { getSpecialForm, type SpecialFormRow, type SpecialFormSchema } from '@/config/special-forms'

const EMPTY = '—'

/** A flat table ready for any renderer: a header row of columns + body rows. */
export interface SpecialFormTable {
  title: string
  columns: string[]
  rows: string[][]
}

/** Value-map key for a single cell. Single-column forms use colKey 'valeur'. */
export function cellKey(rowKey: string, colKey: string): string {
  return `${rowKey}__${colKey}`
}

/** An empty form for a layout — no values, just the layout tag. */
export function emptySpecialForm(layout: SpecialLayout): SpecialFormState {
  return { layout, values: {} }
}

function rowLabel(row: SpecialFormRow): string {
  return row.unit ? `${row.label} (${row.unit})` : row.label
}

function cellValue(values: Record<string, string>, rowKey: string, colKey: string): string {
  return (values[cellKey(rowKey, colKey)] ?? '').trim()
}

/** True when a row has at least one filled value cell. */
function rowHasValue(schema: SpecialFormSchema, values: Record<string, string>, row: SpecialFormRow): boolean {
  return schema.valueColumns.some((c) => cellValue(values, row.key, c.key) !== '')
}

/**
 * Build the presentation table. Columns are: Paramètre, the value column(s), and
 * (when the schema asks) a "Valeur usuelle" reference column. Every row is always
 * included so the document shows the full structured exam, blanks as em dashes.
 */
export function buildSpecialFormTable(state: SpecialFormState): SpecialFormTable {
  const schema = getSpecialForm(state.layout)
  const columns = ['Paramètre', ...schema.valueColumns.map((c) => c.label)]
  if (schema.showReference) columns.push('Valeur usuelle')

  const rows = schema.rows.map((row) => {
    const cells = [rowLabel(row)]
    for (const col of schema.valueColumns) {
      cells.push(cellValue(state.values, row.key, col.key) || EMPTY)
    }
    if (schema.showReference) cells.push(row.reference ?? EMPTY)
    return cells
  })

  return { title: schema.title, columns, rows }
}

/**
 * Plain-text rendering of the filled rows, for the RÉSULTATS section. Only rows
 * with at least one measured value are emitted (a blank table yields ''). This is
 * what gets stored in structuredData.results so finalization validation and any
 * text-only export still carry the content.
 */
export function renderSpecialFormText(state: SpecialFormState): string {
  const schema = getSpecialForm(state.layout)
  const lines: string[] = []

  for (const row of schema.rows) {
    if (!rowHasValue(schema, state.values, row)) continue
    const label = rowLabel(row)

    if (schema.valueColumns.length === 1) {
      const val = cellValue(state.values, row.key, schema.valueColumns[0].key) || EMPTY
      const ref = schema.showReference && row.reference ? ` (usuel ${row.reference})` : ''
      lines.push(`${label} : ${val}${ref}`)
    } else {
      const parts = schema.valueColumns
        .map((c) => `${c.label.toLowerCase()} ${cellValue(state.values, row.key, c.key) || EMPTY}`)
        .join(', ')
      lines.push(`${label} — ${parts}`)
    }
  }

  return lines.join('\n')
}

/** Required rows still missing every value. Used by the editor before finalizing. */
export function missingRequiredRows(state: SpecialFormState): SpecialFormRow[] {
  const schema = getSpecialForm(state.layout)
  return schema.rows.filter((row) => row.required && !rowHasValue(schema, state.values, row))
}

/** True when every required row has at least one measured value. */
export function isSpecialFormComplete(state: SpecialFormState): boolean {
  return missingRequiredRows(state).length === 0
}
