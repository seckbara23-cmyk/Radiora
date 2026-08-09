import { describe, it, expect } from 'vitest'
import {
  PRODUCT_SCOPE,
  featureScope,
  featuresInScope,
  isFrozenRoute,
  isNeverRedirected,
  frozenRoutes,
  LANDING_ROUTE,
} from '@/config/product-scope'
import { visibleNavHrefs, visibleNavigation } from '@/config/navigation'
import { canSignReports } from '@/lib/safety/authority'
import type { UserRole } from '@/types/user'

// R2.1 — product surface freeze.
//
// The visible surface is decided in ONE place (config/product-scope.ts) and the
// navigation derives from it, so these tests assert the contract rather than
// scraping components.

const radiologistNav = () => visibleNavHrefs('radiologist')

describe('scope classification', () => {
  it('the workflow is CORE', () => {
    for (const key of [
      'new_report', 'reports', 'templates', 'workstation_dictation',
      'qr_mobile_dictation', 'audio_import', 'transcription', 'ai_structuring',
      'report_editor', 'signature', 'export_pdf_docx_print', 'secure_delivery',
      'report_history',
    ] as const) {
      expect(featureScope(key), key).toBe('CORE')
    }
  })

  it('plumbing is SUPPORTING_HIDDEN and never a nav item', () => {
    for (const key of featuresInScope('SUPPORTING_HIDDEN')) {
      const def = PRODUCT_SCOPE[key] as { route?: string }
      if (def.route) expect(radiologistNav()).not.toContain(def.route)
    }
  })

  it('administration is ADMIN_ONLY', () => {
    for (const key of ['users', 'institution', 'letterhead', 'account_administration'] as const) {
      expect(featureScope(key), key).toBe('ADMIN_ONLY')
    }
  })

  it('every registry entry carries exactly one scope', () => {
    const valid = ['CORE', 'SUPPORTING_HIDDEN', 'FROZEN', 'ADMIN_ONLY']
    for (const key of Object.keys(PRODUCT_SCOPE) as (keyof typeof PRODUCT_SCOPE)[]) {
      expect(valid, key).toContain(featureScope(key))
    }
  })
})

// ── 1–13: what a normal radiologist sees ─────────────────────────────────────

describe('radiologist navigation', () => {
  const absent: [string, string][] = [
    ['1. Dashboard',        '/dashboard'],
    ['2. Patients',         '/patients'],
    ['3. Studies',          '/studies'],
    ['4. Voice Dictation',  '/vacations'],
    ['5. Secretary Desk',   '/secretary'],
    ['6. Analytics',        '/analytics'],
    ['7. Critical Queue',   '/critical-queue'],
    ['8. Audit History',    '/audit'],
    ['9. Feedback',         '/feedback'],
    ['10. Pilot Dashboard', '/pilot'],
  ]

  for (const [label, href] of absent) {
    it(`${label} is absent`, () => {
      expect(radiologistNav()).not.toContain(href)
    })
  }

  it('11. Reports remains visible', () => {
    expect(radiologistNav()).toContain('/reports')
  })

  it('12. Templates remains visible', () => {
    expect(radiologistNav()).toContain('/templates')
  })

  it('13. New Report is visible and marked as the primary action', () => {
    const groups = visibleNavigation('radiologist')
    const items = groups.flatMap((g) => g.items)
    const newReport = items.find((i) => i.href === '/reports/new')
    expect(newReport).toBeDefined()
    expect(newReport!.primary).toBe(true)
    // …and it comes first.
    expect(items[0].href).toBe('/reports/new')
  })

  it('the whole clinical surface is exactly three items', () => {
    expect(radiologistNav()).toEqual(['/reports/new', '/reports', '/templates'])
  })

  it('14. a radiologist sees no administration controls', () => {
    const nav = radiologistNav()
    for (const href of ['/users', '/settings', '/settings/headers', '/admin']) {
      expect(nav, href).not.toContain(href)
    }
  })
})

// ── 15–16: administration ────────────────────────────────────────────────────

describe('administration', () => {
  it('15. a clinic admin reaches the permitted admin functions', () => {
    const nav = visibleNavHrefs('clinic_admin')
    expect(nav).toContain('/users')
    expect(nav).toContain('/settings')
    expect(nav).toContain('/settings/headers')
  })

  it('15b. a super admin also reaches the platform portal', () => {
    expect(visibleNavHrefs('super_admin')).toContain('/admin')
  })

  it('15c. a clinic admin does NOT reach the platform portal', () => {
    expect(visibleNavHrefs('clinic_admin')).not.toContain('/admin')
  })

  it('16. administrative access grants NO clinical signing authority', () => {
    // R0.8 boundary — unchanged by the surface freeze.
    expect(canSignReports('clinic_admin')).toBe(false)
    expect(canSignReports('super_admin')).toBe(false)
    expect(canSignReports('radiologist')).toBe(true)
  })

  it('non-clinical roles see no clinical navigation', () => {
    for (const role of ['technician', 'viewer', 'referring_physician'] as UserRole[]) {
      expect(visibleNavHrefs(role)).not.toContain('/templates')
    }
  })

  it('a signed-out visitor sees nothing', () => {
    expect(visibleNavHrefs(null)).toEqual([])
  })
})

// ── 17–23: route policy ──────────────────────────────────────────────────────

describe('redirect policy', () => {
  it('17/18. frozen routes are redirected', () => {
    for (const route of [
      '/dashboard', '/patients', '/studies', '/vacations', '/secretary',
      '/analytics', '/critical-queue', '/audit', '/feedback', '/pilot',
      '/settings/billing', '/settings/notifications',
    ]) {
      expect(isFrozenRoute(route), route).toBe(true)
    }
  })

  it('17b. frozen sub-routes are redirected too', () => {
    expect(isFrozenRoute('/patients/abc-123')).toBe(true)
    expect(isFrozenRoute('/vacations/items/xyz')).toBe(true)
  })

  it('19. public secure delivery is NOT redirected', () => {
    expect(isFrozenRoute('/r/some-delivery-token')).toBe(false)
    expect(isNeverRedirected('/r/some-delivery-token')).toBe(true)
  })

  it('20. the print route is NOT redirected', () => {
    expect(isFrozenRoute('/reports/abc-123/print')).toBe(false)
  })

  it('21. the QR/mobile token route is NOT redirected', () => {
    expect(isFrozenRoute('/m/capability-token')).toBe(false)
    expect(isNeverRedirected('/m/capability-token')).toBe(true)
  })

  it('22. API, auth and webhook routes are unaffected', () => {
    for (const route of [
      '/api/reports/abc/pdf',
      '/api/reports/abc/docx',
      '/api/delivery/tok/file',
      '/api/payments/wave/webhook',
      '/auth/logout',
    ]) {
      expect(isFrozenRoute(route), route).toBe(false)
      expect(isNeverRedirected(route), route).toBe(true)
    }
  })

  it('22b. authentication pages are unaffected', () => {
    for (const route of ['/login', '/signup', '/accept-invite', '/deactivated']) {
      expect(isFrozenRoute(route), route).toBe(false)
    }
  })

  it('23. no redirect loop — the landing page is never frozen', () => {
    expect(isFrozenRoute(LANDING_ROUTE)).toBe(false)
    expect(frozenRoutes()).not.toContain(LANDING_ROUTE)
    // and the target of every frozen redirect is itself reachable
    expect(isNeverRedirected(LANDING_ROUTE)).toBe(true)
  })

  it('24. existing report links still resolve', () => {
    for (const route of ['/reports', '/reports/new', '/reports/abc-123', '/reports/abc-123/print']) {
      expect(isFrozenRoute(route), route).toBe(false)
    }
  })

  it('CORE and ADMIN_ONLY routes are never frozen', () => {
    for (const key of [...featuresInScope('CORE'), ...featuresInScope('ADMIN_ONLY')]) {
      const route = (PRODUCT_SCOPE[key] as { route?: string }).route
      if (route) expect(isFrozenRoute(route), `${key} ${route}`).toBe(false)
    }
  })

  it('public marketing pages are not redirected', () => {
    for (const route of ['/', '/features', '/pricing', '/security', '/contact', '/support/demarrer']) {
      expect(isFrozenRoute(route), route).toBe(false)
    }
  })
})
