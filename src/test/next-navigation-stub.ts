// Test-only stand-in for `next/navigation` (see vitest.config.ts).
//
// Next resolves `next/navigation` through its own bundler alias, so it is not
// resolvable from plain node — which means importing `@/i18n/navigation` under
// vitest fails, because next-intl's client navigation pulls it in.
//
// Stubbing it lets the LOCALE-PATH logic be tested for real: `getPathname` is
// pure path arithmetic and is exactly what the R2.7C 404 turned on. The
// functions below exist only to satisfy the import graph; a test that actually
// depended on Next's routing behaviour would be testing the framework, not us.
//
// Same rationale as the `server-only` stub: the real import stays in the
// source, which is where it does its job.

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT: ${url}`)
}

export function permanentRedirect(url: string): never {
  throw new Error(`NEXT_PERMANENT_REDIRECT: ${url}`)
}

export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND')
}

export function useRouter() {
  throw new Error('useRouter is not available under vitest')
}

export function usePathname(): string {
  throw new Error('usePathname is not available under vitest')
}

export function useSearchParams(): URLSearchParams {
  throw new Error('useSearchParams is not available under vitest')
}

export function useParams(): Record<string, string> {
  throw new Error('useParams is not available under vitest')
}

export const RedirectType = { push: 'push', replace: 'replace' } as const
