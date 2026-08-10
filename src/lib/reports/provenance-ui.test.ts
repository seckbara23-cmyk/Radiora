import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fr from '../../../messages/fr.json'
import en from '../../../messages/en.json'

// R2.7C(E) — "Modifié par vous" is a PROVENANCE BADGE, not a control.
//
// Production finding: it looked exactly like the buttons beside it — same pill
// shape, same size, same border — and did nothing when clicked. It is
// informational and stays informational; what changes is that it now looks and
// is announced like a status. "Reprendre la dictée IA" remains the real control.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const COMPONENT = join(ROOT, 'src/app/[locale]/(dashboard)/reports/[id]/LiveSectionStatus.tsx')
const src = readFileSync(COMPONENT, 'utf8')

type Catalogue = Record<string, Record<string, string>>
const FR = (fr as unknown as Catalogue).live
const EN = (en as unknown as Catalogue).live

/**
 * The JSX element that renders a given translation key — from its OPENING tag
 * up to the key itself, so attributes and nesting are both visible.
 *
 * A naive `lastIndexOf('<')` finds whatever tag happens to sit closest, which
 * for the badge is the nested decorative `<span aria-hidden>`. Depth is tracked
 * backwards so the element that actually encloses the label is the one returned.
 */
function elementFor(key: string): string {
  const at = src.indexOf(`t('${key}')`)
  expect(at, key).toBeGreaterThan(-1)

  let depth = 0
  let i = at
  while (i > 0) {
    const lt = src.lastIndexOf('<', i - 1)
    if (lt < 0) break
    const next = src[lt + 1]
    if (next === '/') depth++
    else if (/[A-Za-z]/.test(next)) {
      if (depth === 0) return src.slice(lt, at)
      depth--
    }
    i = lt
  }
  throw new Error(`no enclosing element for ${key}`)
}

describe('the provenance badge is not a control', () => {
  it('editedByYou renders as a span, never a button', () => {
    const el = elementFor('editedByYou')
    expect(el.startsWith('<span')).toBe(true)
    expect(el).not.toContain('onClick')
    expect(el).not.toContain('type="button"')
  })

  it('it is announced as a status', () => {
    expect(elementFor('editedByYou')).toContain('role="status"')
  })

  it('it carries no button affordance — no pill shape, no hover, no focus ring', () => {
    const el = elementFor('editedByYou')
    expect(el).not.toContain('rounded-full')
    expect(el).not.toContain('hover:')
    expect(el).not.toContain('focus-visible:ring')
    expect(el).not.toContain('cursor-pointer')
  })

  it('it explains itself on hover', () => {
    expect(elementFor('editedByYou')).toContain('title=')
    expect(FR.editedByYouHint).toBeTruthy()
    expect(EN.editedByYouHint).toBeTruthy()
  })
})

describe('the actionable control still is one', () => {
  it('resumeAi is a real button with a click handler', () => {
    const el = elementFor('resumeAi')
    expect(el.startsWith('<button')).toBe(true)
    expect(el).toContain('onClick')
    expect(el).toContain('onResumeAi(section)')
  })

  it('it keeps its interactive affordances', () => {
    const el = elementFor('resumeAi')
    expect(el).toContain('hover:')
    expect(el).toContain('focus-visible:ring')
  })

  it('accept and reject are buttons too', () => {
    for (const key of ['accept', 'reject']) {
      expect(elementFor(key).startsWith('<button'), key).toBe(true)
    }
  })
})

describe('B — the doctor can still see a correction that was not applied', () => {
  const workspace = readFileSync(
    join(ROOT, 'src/app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx'),
    'utf8',
  )

  it('unresolved corrections are surfaced, not merely counted', () => {
    expect(workspace).toContain("(e) => e.applied === false")
    expect(workspace).toContain("tLive('unresolvedCorrections')")
    expect(workspace).toContain("tLive('proposedReplacement')")
    expect(workspace).toContain("tLive('originalFinding')")
  })

  it('both the finding kept and the replacement proposed are shown', () => {
    expect(workspace).toMatch(/\{e\.removed \|\| '—'\}/)
    expect(workspace).toMatch(/\{e\.kept \|\| '—'\}/)
  })

  it('the wording exists in both locales', () => {
    for (const key of ['unresolvedCorrections', 'unresolvedCorrectionsHint', 'proposedReplacement', 'originalFinding']) {
      expect(FR[key], `fr.live.${key}`).toBeTruthy()
      expect(EN[key], `en.live.${key}`).toBeTruthy()
    }
  })
})
