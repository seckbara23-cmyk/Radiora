// F11 — radiologist signature builder.
//
// PURE and deterministic: turns a radiologist's configured signature preference
// into the exact text line that is auto-inserted on every exported report. The
// export model, the print page and the live profile preview all call this single
// function so the signature is identical everywhere.

export type SignatureStyle = 'full' | 'initials_surname' | 'custom'

export const SIGNATURE_STYLES: readonly SignatureStyle[] = ['full', 'initials_surname', 'custom']
export const TITLE_PREFIXES: readonly string[] = ['Dr', 'Pr']

export interface SignatureInput {
  /** Honorific prefix, typically 'Dr' or 'Pr'. */
  titlePrefix: string
  firstName: string
  lastName: string
  style: SignatureStyle
  /** Verbatim text used when style === 'custom'. */
  custom?: string
}

function squish(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Build the signature name line.
 *  - 'full'             → "Dr Abibou Ba"
 *  - 'initials_surname' → "Dr A. Ba"  (one initial per given name)
 *  - 'custom'           → the custom text, verbatim
 * Returns '' when there is nothing to show (caller decides the fallback).
 */
export function buildSignatureName(input: SignatureInput): string {
  if (input.style === 'custom') {
    return squish(input.custom ?? '')
  }

  const prefix = squish(input.titlePrefix ?? '')
  const first = squish(input.firstName ?? '')
  const last = squish(input.lastName ?? '')

  if (input.style === 'initials_surname') {
    const initials = first
      .split(' ')
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(' ')
    return squish([prefix, initials, last].filter(Boolean).join(' '))
  }

  // 'full'
  return squish([prefix, first, last].filter(Boolean).join(' '))
}

/** Normalize an arbitrary stored value to a known SignatureStyle. */
export function coerceSignatureStyle(value: string | null | undefined): SignatureStyle {
  return (SIGNATURE_STYLES as readonly string[]).includes(value ?? '')
    ? (value as SignatureStyle)
    : 'full'
}
