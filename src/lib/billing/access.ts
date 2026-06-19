// Phase 4A — server-side subscription access gate.
//
// Resolves the EFFECTIVE access a clinic has right now and exposes a single
// guard used by every clinical write action. When a subscription has lapsed
// (trial expired, suspended, cancelled, grace period over) clinical workflows
// become read-only: existing reports stay readable, but no new clinical content
// may be created or modified. Fails OPEN when no subscription is on record.
//
// Server-only.

import 'server-only'
import { getClinicSubscription } from '@/lib/data/billing'
import { computeAccess, type ClinicAccess } from './subscription'

// Shown to staff when their clinic is read-only. French (platform default).
export const READ_ONLY_MESSAGE =
  'Votre abonnement est en lecture seule. Régularisez votre paiement pour créer ou modifier des comptes rendus.'

export async function getClinicAccess(clinicId: string | null): Promise<ClinicAccess> {
  const now = new Date().toISOString()
  if (!clinicId) return computeAccess(null, now)
  const sub = await getClinicSubscription(clinicId)
  return computeAccess(sub, now)
}

export async function clinicCanWrite(clinicId: string | null): Promise<boolean> {
  const access = await getClinicAccess(clinicId)
  return access.canWrite
}
