import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Feature 10 — unit tests for the medical-safety invariants.
// Tests import ONLY pure modules (no next/headers, no Supabase, no server IO).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // R0.5 — `server-only` is a Next build-time guard that throws if a module
      // is pulled into a client bundle; it has no runtime implementation to
      // resolve under vitest. Stubbing it lets us unit-test server-only pure
      // logic (e.g. the delivery download grant) WITHOUT removing the guard
      // from the source, which is what actually keeps it off the client.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
      // Same reasoning for `next/navigation`: Next resolves it through its own
      // bundler alias, so `@/i18n/navigation` cannot be imported under vitest
      // without it. Stubbing it lets the locale-path arithmetic that caused the
      // R2.7C 404 be tested for real.
      'next/navigation': fileURLToPath(new URL('./src/test/next-navigation-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // next-intl ships ESM that imports `next/navigation` directly. Vite only
    // applies `resolve.alias` to modules it transforms, so next-intl has to be
    // inlined for the stub above to take effect.
    server: { deps: { inline: ['next-intl'] } },
  },
})
