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
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
