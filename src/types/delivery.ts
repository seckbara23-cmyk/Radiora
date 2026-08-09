import type { DeliveryChannel, PasswordKind } from '@/lib/delivery/policy'

// A secure delivery record as surfaced to STAFF (the patient never sees this shape).
export interface ReportDelivery {
  id: string
  clinicId: string
  reportId: string
  channel: DeliveryChannel
  recipientLabel: string
  token: string
  passwordKind: PasswordKind
  hasPassword: boolean
  filenameBase: string
  headerChoice: string
  expiresAt: string | null
  openedCount: number
  downloadCount: number
  lastAccessedAt: string | null
  revokedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// Minimal shape resolved on the public (unauthenticated) path via the
// service-role client. Never exposes report content directly.
export interface PublicDelivery {
  id: string
  clinicId: string
  reportId: string
  channel: DeliveryChannel
  passwordKind: PasswordKind
  passwordHash: string | null
  pdfPath: string | null
  docxPath: string | null
  filenameBase: string
  expiresAt: string | null
  revokedAt: string | null
  /** R0.5 — durable brute-force counters (migration 040). */
  failedAttempts: number
  lockedUntil: string | null
}
