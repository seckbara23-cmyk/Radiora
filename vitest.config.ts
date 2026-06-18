import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Feature 10 — unit tests for the medical-safety invariants.
// Tests import ONLY pure modules (no next/headers, no Supabase, no server IO).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
