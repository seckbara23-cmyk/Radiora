import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { UserRole } from '@/types/user'

// R2.7C repair — who may read the STT diagnostic.
//
// THE INCIDENT
// The first version of this route required `super_admin`. That role is real —
// it was not invented — but it is strictly NARROWER than the Administration
// area, which is gated on clinic_admin OR super_admin. So an authenticated
// clinic administrator, looking at Utilisateurs / Paramètres / En-tête in the
// same browser, got `Forbidden` from an endpoint built for exactly them.
//
// These tests invoke the real route handler with a mocked session, so the
// authorization is exercised rather than asserted about.

const currentUser = vi.hoisted(() => ({ value: null as { id: string; clinicId: string; role: UserRole } | null }))

vi.mock('@/lib/auth/get-current-user', () => ({
  requireCurrentUser: async () => {
    if (!currentUser.value) {
      // Mirrors the real helper: an unauthenticated caller never reaches the
      // handler body — it redirects/throws before that.
      throw new Error('NEXT_REDIRECT: /login')
    }
    return currentUser.value
  },
}))

// The audit writer talks to Supabase; the authorization decision must not
// depend on it, so it is stubbed and separately asserted for payload safety.
const auditCalls: Array<Record<string, unknown>> = []
vi.mock('@/lib/actions/audit', () => ({
  logAudit: async (entry: Record<string, unknown>) => { auditCalls.push(entry) },
}))

const { GET } = await import('@/app/api/admin/stt-health/route')

const asRole = (role: UserRole) => {
  currentUser.value = { id: 'u-1', clinicId: 'c-1', role }
}

beforeEach(() => {
  auditCalls.length = 0
  currentUser.value = null
  // No STT_* in the test environment → the handler answers UNCONFIGURED
  // without any network call.
  delete process.env.STT_PROVIDER
  delete process.env.STT_BASE_URL
  delete process.env.STT_MODEL
  delete process.env.STT_API_KEY
})

describe('the STT diagnostic is administrator-only', () => {
  it('an unauthenticated caller never reaches the handler body', async () => {
    currentUser.value = null
    await expect(GET()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(auditCalls).toEqual([])
  })

  const allowed: UserRole[] = ['clinic_admin', 'super_admin']
  for (const role of allowed) {
    it(`${role} is allowed — the canonical administrator contract`, async () => {
      asRole(role)
      const res = await GET()
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.state).toBe('UNCONFIGURED')
    })
  }

  const denied: UserRole[] = ['radiologist', 'secretary', 'technician', 'referring_physician', 'viewer']
  for (const role of denied) {
    it(`${role} is denied`, async () => {
      asRole(role)
      const res = await GET()
      expect(res.status).toBe(403)
      expect(await res.text()).toBe('Forbidden')
      // A refused caller leaves no audit trail of a check that did not happen.
      expect(auditCalls).toEqual([])
    })
  }

  it('the radiologist — the most privileged CLINICAL role — is still denied', async () => {
    // Administering an installation is not a clinical capability.
    asRole('radiologist')
    expect((await GET()).status).toBe(403)
  })
})

describe('authorization comes from the existing permission source', () => {
  const ROUTE = readFileSync(
    fileURLToPath(new URL('../../app/api/admin/stt-health/route.ts', import.meta.url)), 'utf8',
  )

  it('uses canManageClinicSettings, not an inline role list', async () => {
    expect(ROUTE).toContain('canManageClinicSettings')
    expect(ROUTE).toContain("from '@/lib/safety/authority'")
    // No second role system, no re-declared array.
    expect(ROUTE).not.toMatch(/\[\s*'clinic_admin'\s*,\s*'super_admin'\s*\]/)
  })

  it('special-cases no account, email or identifier', async () => {
    // `@` alone would match every `@/lib/...` import path — target the actual
    // hazard: a hard-coded address or an identity comparison.
    expect(ROUTE).not.toMatch(/['"][\w.+-]+@[\w.-]+\.\w+['"]/)   // an email literal
    expect(ROUTE).not.toMatch(/user\.(email|id)\s*===/)          // identity check
    expect(ROUTE).not.toMatch(/allowlist|allowList|whitelist/i)
  })

  it('the predicate is exactly the one the Administration area uses', async () => {
    const { canManageClinicSettings } = await import('@/lib/safety/authority')
    expect(canManageClinicSettings('clinic_admin')).toBe(true)
    expect(canManageClinicSettings('super_admin')).toBe(true)
    for (const role of ['radiologist', 'secretary', 'technician', 'viewer'] as UserRole[]) {
      expect(canManageClinicSettings(role), role).toBe(false)
    }
  })

  it('resolves the session the same way authenticated pages do', () => {
    expect(ROUTE).toContain('requireCurrentUser')
    // Not a second client, not a service-role bypass.
    expect(ROUTE).not.toContain('createAdminClient')
    expect(ROUTE).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})

describe('existing Administration authorization is unchanged', () => {
  it('the Users page still gates on the same two roles', () => {
    const page = readFileSync(
      fileURLToPath(new URL('../../app/[locale]/(dashboard)/users/page.tsx', import.meta.url)), 'utf8',
    )
    expect(page).toContain("['clinic_admin', 'super_admin'].includes(currentUser.role)")
  })

  it('the Administration nav group still gates on the same two roles', () => {
    const nav = readFileSync(
      fileURLToPath(new URL('../../config/navigation.ts', import.meta.url)), 'utf8',
    )
    expect(nav).toContain("const CLINIC_ADMIN_ROLES: UserRole[] = ['clinic_admin', 'super_admin']")
    // The platform-only group stays super_admin-only.
    expect(nav).toMatch(/titleKey: 'platformSection'[\s\S]{0,80}roles: \['super_admin'\]/)
  })
})

describe('the response and its audit leak nothing', () => {
  it('an allowed caller receives no credential', async () => {
    process.env.STT_PROVIDER = 'openai-compatible'
    process.env.STT_MODEL = 'whisper-1'
    process.env.STT_BASE_URL = 'https://stt.example.com/v1'
    process.env.STT_API_KEY = 'THE-SECRET-VALUE'

    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'whisper-1' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    try {
      asRole('clinic_admin')
      const res = await GET()
      const raw = await res.text()

      expect(res.status).toBe(200)
      expect(raw).not.toContain('THE-SECRET-VALUE')
      // Host is safe and useful; the full URL is not returned.
      expect(raw).toContain('stt.example.com')
      expect(raw).not.toContain('https://stt.example.com/v1')
      expect(JSON.parse(raw).hasApiKey).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })

  it('the audit records the state and nothing else', async () => {
    process.env.STT_API_KEY = 'THE-SECRET-VALUE'
    asRole('clinic_admin')
    await GET()

    expect(auditCalls).toHaveLength(1)
    const serialised = JSON.stringify(auditCalls[0])
    expect(serialised).not.toContain('THE-SECRET-VALUE')
    for (const forbidden of ['baseUrl', 'endpointHost', 'apiKey', 'transcript', 'patient']) {
      expect(serialised, forbidden).not.toContain(forbidden)
    }
    expect(auditCalls[0]).toMatchObject({ action: 'stt.health_checked' })
  })

  it('the response is never cached', async () => {
    asRole('clinic_admin')
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
