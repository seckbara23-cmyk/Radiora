// R2.7C — STT activation diagnostic.
//   GET /api/admin/stt-health → application/json
//
// Lets an operator confirm, from the deployed environment, whether automatic
// transcription is configured and whether the configured endpoint answers —
// WITHOUT sending audio, transcribing anything, or touching a patient, report
// or recording.
//
// This is an operational endpoint, not a clinical one: it is outside the R2.1
// product surface and appears in no navigation.
//
// AUTHORIZATION uses `canManageClinicSettings` — the SAME predicate that gates
// the Administration area (Users / Institution / Letterhead), i.e. clinic_admin
// or super_admin. The first version of this route required super_admin alone,
// which is a strictly narrower role, so the clinic administrators who actually
// operate an installation were refused by an endpoint built for them.
//
// The response contains no credential, no full URL and no clinical data — see
// `checkSttHealth`, which is what builds it.

import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { canManageClinicSettings } from '@/lib/safety/authority'
import { checkSttHealth } from '@/lib/stt/health'
import { logAudit } from '@/lib/actions/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // Same session resolution as every authenticated page and route handler.
  const user = await requireCurrentUser()
  if (!canManageClinicSettings(user.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const health = await checkSttHealth()

  // State only. Never the endpoint, never the credential.
  await logAudit({
    userId: user.id,
    clinicId: user.clinicId,
    action: 'stt.health_checked',
    entityType: 'system',
    entityId: 'stt',
    metadata: { state: health.state },
  }).catch(() => {})

  return Response.json(health, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  })
}
