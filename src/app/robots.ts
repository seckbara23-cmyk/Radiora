import type { MetadataRoute } from 'next'

// R2.8 — the ONLY thing this file does is tell crawlers which paths are worth
// indexing. It cannot make a protected route reachable or unreachable — that
// is middleware's job (PROTECTED_SEGMENTS in src/middleware.ts) and is
// unchanged by this file. This exists solely so authenticated clinical
// content, capability-token links and admin surfaces never show up in a
// search index by omission.
//
// Lives OUTSIDE the [locale] segment on purpose: Next serves this file at the
// bare `/robots.txt`, which is exactly what crawlers request and exactly what
// the middleware matcher already excludes
// (`'/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'`),
// so no middleware or product-scope change was needed to add it.

const DISALLOW = [
  '/api/',
  '/auth/',
  '/r/',              // secure delivery — bears a capability token in the URL
  '/m/',              // QR mobile dictation — bears a capability token
  '/accept-invite',
  '/deactivated',
  '/onboarding-error',
  // Authenticated app surface — mirrors PROTECTED_SEGMENTS in src/middleware.ts.
  '/dashboard', '/patients', '/studies', '/reports', '/settings', '/users',
  '/admin', '/audit', '/templates', '/analytics', '/critical-queue',
  '/vacations', '/secretary', '/feedback', '/pilot',
]

export default function robots(): MetadataRoute.Robots {
  const disallow = DISALLOW.flatMap((p) => [`/fr${p}`, `/en${p}`])
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow,
    },
  }
}
