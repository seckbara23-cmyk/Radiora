import { describe, it, expect } from 'vitest'
import robots from './robots'

// R2.8 — robots.ts is a plain function, so this is a REAL behavioural test
// (call it, inspect the return value), not source-scraping. It cannot make a
// route reachable/unreachable on its own — middleware still owns that — this
// only asserts what crawlers are told.

describe('robots()', () => {
  const rules = robots().rules
  const disallow = Array.isArray(rules) ? [] : ((rules.disallow as string[]) ?? [])

  it('allows the site by default', () => {
    const rule = Array.isArray(rules) ? rules[0] : rules
    expect(rule.userAgent).toBe('*')
    expect(rule.allow).toBe('/')
  })

  it('disallows authenticated app segments in both locales', () => {
    for (const seg of ['/reports', '/patients', '/studies', '/settings', '/users', '/admin']) {
      expect(disallow, seg).toContain(`/fr${seg}`)
      expect(disallow, seg).toContain(`/en${seg}`)
    }
  })

  it('disallows capability-token surfaces (secure delivery, QR mobile)', () => {
    for (const seg of ['/r/', '/m/']) {
      expect(disallow, seg).toContain(`/fr${seg}`)
      expect(disallow, seg).toContain(`/en${seg}`)
    }
  })

  it('disallows account-edge-case pages', () => {
    for (const seg of ['/accept-invite', '/deactivated', '/onboarding-error']) {
      expect(disallow, seg).toContain(`/fr${seg}`)
    }
  })

  it('disallows API and the logout route handler', () => {
    expect(disallow).toContain('/fr/api/')
    expect(disallow).toContain('/fr/auth/')
  })

  it('does NOT disallow the public entry surface', () => {
    for (const path of ['/fr/login', '/en/login', '/fr/signup', '/en/signup', '/fr/features', '/fr/security', '/fr/pricing', '/fr/contact']) {
      expect(disallow, path).not.toContain(path)
    }
  })

  it('every disallow entry is locale-prefixed (fr or en)', () => {
    for (const path of disallow) {
      expect(path, path).toMatch(/^\/(fr|en)\//)
    }
  })
})
