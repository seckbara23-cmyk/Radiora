import { describe, it, expect } from 'vitest'
import {
  buildSpecialFormTable,
  renderSpecialFormText,
  missingRequiredRows,
  isSpecialFormComplete,
  emptySpecialForm,
  cellKey,
} from './special-forms'
import type { SpecialFormState } from '@/types/report'

describe('emptySpecialForm', () => {
  it('creates an empty form tagged with the layout', () => {
    expect(emptySpecialForm('mammographie')).toEqual({ layout: 'mammographie', values: {} })
  })
})

describe('buildSpecialFormTable — scannopelvimétrie (single value column + reference)', () => {
  const state: SpecialFormState = {
    layout: 'scannopelvimetrie',
    values: {
      [cellKey('prp', 'valeur')]: '110',
      [cellKey('tm', 'valeur')]: '130',
    },
  }

  it('has Paramètre, Valeur and Valeur usuelle columns', () => {
    const t = buildSpecialFormTable(state)
    expect(t.columns).toEqual(['Paramètre', 'Valeur', 'Valeur usuelle'])
  })

  it('includes every row, filled values and reference, blanks as em dash', () => {
    const t = buildSpecialFormTable(state)
    expect(t.rows).toHaveLength(5)
    expect(t.rows[0]).toEqual(['Diamètre promonto-rétro-pubien (PRP) (mm)', '110', '≥ 105 mm'])
    // a row with no value keeps the reference but shows an em dash measurement
    const conjugue = t.rows.find((r) => r[0].startsWith('Conjugué'))!
    expect(conjugue[1]).toBe('—')
    expect(conjugue[2]).toBe('≥ 105 mm')
  })
})

describe('buildSpecialFormTable — TAGT / mammographie (two value columns, no reference)', () => {
  it('uses the side columns and omits the reference column', () => {
    const t = buildSpecialFormTable({
      layout: 'tagt',
      values: { [cellKey('femur', 'droit')]: '420', [cellKey('femur', 'gauche')]: '418' },
    })
    expect(t.columns).toEqual(['Paramètre', 'Membre droit', 'Membre gauche'])
    expect(t.rows[0]).toEqual(['Longueur fémorale (mm)', '420', '418'])
  })

  it('mammographie keeps both breast columns', () => {
    const t = buildSpecialFormTable(emptySpecialForm('mammographie'))
    expect(t.columns).toEqual(['Paramètre', 'Sein droit', 'Sein gauche'])
    // all blank → every cell an em dash
    expect(t.rows.every((r) => r[1] === '—' && r[2] === '—')).toBe(true)
  })
})

describe('renderSpecialFormText', () => {
  it('returns empty string for an empty form', () => {
    expect(renderSpecialFormText(emptySpecialForm('scannopelvimetrie'))).toBe('')
  })

  it('emits only filled rows for a single-column form, with the reference', () => {
    const text = renderSpecialFormText({
      layout: 'scannopelvimetrie',
      values: { [cellKey('prp', 'valeur')]: '110' },
    })
    expect(text).toBe('Diamètre promonto-rétro-pubien (PRP) (mm) : 110 (usuel ≥ 105 mm)')
  })

  it('joins both sides for a two-column form', () => {
    const text = renderSpecialFormText({
      layout: 'tagt',
      values: { [cellKey('femur', 'droit')]: '420', [cellKey('femur', 'gauche')]: '418' },
    })
    expect(text).toBe('Longueur fémorale (mm) — membre droit 420, membre gauche 418')
  })

  it('never invents values — a side left blank shows an em dash', () => {
    const text = renderSpecialFormText({
      layout: 'tagt',
      values: { [cellKey('tibia', 'droit')]: '350' },
    })
    expect(text).toBe('Longueur tibiale (mm) — membre droit 350, membre gauche —')
  })
})

describe('required-field validation', () => {
  it('reports all required rows missing on an empty scannopelvimétrie', () => {
    const missing = missingRequiredRows(emptySpecialForm('scannopelvimetrie'))
    expect(missing.map((r) => r.key)).toEqual(['prp', 'tm', 'bisciatique', 'magnin'])
    expect(isSpecialFormComplete(emptySpecialForm('scannopelvimetrie'))).toBe(false)
  })

  it('is complete once all required rows have a value', () => {
    const state: SpecialFormState = {
      layout: 'scannopelvimetrie',
      values: {
        [cellKey('prp', 'valeur')]: '110',
        [cellKey('tm', 'valeur')]: '130',
        [cellKey('bisciatique', 'valeur')]: '105',
        [cellKey('magnin', 'valeur')]: '240',
      },
    }
    expect(missingRequiredRows(state)).toEqual([])
    expect(isSpecialFormComplete(state)).toBe(true)
  })

  it('mammographie requires the ACR classification on at least one side', () => {
    const empty = emptySpecialForm('mammographie')
    expect(isSpecialFormComplete(empty)).toBe(false)
    const withAcr: SpecialFormState = {
      layout: 'mammographie',
      values: { [cellKey('classification', 'droit')]: 'ACR 2' },
    }
    expect(isSpecialFormComplete(withAcr)).toBe(true)
  })
})
