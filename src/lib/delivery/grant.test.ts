import { describe, it, expect, beforeAll } from 'vitest'

// R0.5 — the download grant replaces `?pw=<date-of-birth>` in the URL. It must
// be unforgeable without the server secret and must expire.

beforeAll(() => {
  process.env.DELIVERY_GRANT_SECRET = 'test-secret-for-delivery-grants'
})

const DELIVERY = 'd1f0b0e4-0000-4000-8000-000000000001'
const OTHER    = 'd1f0b0e4-0000-4000-8000-000000000002'
const NOW = Date.parse('2026-08-09T12:00:00.000Z')

async function mod() {
  return import('@/lib/delivery/grant')
}

describe('delivery download grant', () => {
  it('a freshly issued grant verifies', async () => {
    const { issueGrant, verifyGrant } = await mod()
    expect(verifyGrant(DELIVERY, issueGrant(DELIVERY, NOW), NOW)).toBe(true)
  })

  it('is bound to ONE delivery — it cannot unlock another patient’s report', async () => {
    const { issueGrant, verifyGrant } = await mod()
    expect(verifyGrant(OTHER, issueGrant(DELIVERY, NOW), NOW)).toBe(false)
  })

  it('expires', async () => {
    const { issueGrant, verifyGrant, GRANT_TTL_SECONDS } = await mod()
    const grant = issueGrant(DELIVERY, NOW)
    expect(verifyGrant(DELIVERY, grant, NOW + (GRANT_TTL_SECONDS - 5) * 1000)).toBe(true)
    expect(verifyGrant(DELIVERY, grant, NOW + (GRANT_TTL_SECONDS + 1) * 1000)).toBe(false)
  })

  it('rejects a tampered expiry (the signature covers it)', async () => {
    const { issueGrant, verifyGrant } = await mod()
    const grant = issueGrant(DELIVERY, NOW)
    const sig = grant.slice(grant.indexOf('.') + 1)
    const farFuture = Math.floor(NOW / 1000) + 999_999
    expect(verifyGrant(DELIVERY, `${farFuture}.${sig}`, NOW)).toBe(false)
  })

  it('rejects garbage, empty and missing values', async () => {
    const { verifyGrant } = await mod()
    for (const bad of ['', '   ', 'abc', '.', 'x.y', null, undefined]) {
      expect(verifyGrant(DELIVERY, bad, NOW)).toBe(false)
    }
  })

  it('scopes the cookie to this delivery and this token path', async () => {
    const { grantCookieName, grantCookiePath } = await mod()
    expect(grantCookieName(DELIVERY)).toBe(`rdg_${DELIVERY.replace(/-/g, '')}`)
    expect(grantCookiePath('tok en/../x')).toBe(`/api/delivery/${encodeURIComponent('tok en/../x')}`)
  })
})
