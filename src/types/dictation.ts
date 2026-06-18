// Feature 3 — phone-as-remote-dictation-device types.

export type DictationSessionStatus =
  | 'pending'
  | 'connected'
  | 'recording'
  | 'completed'
  | 'expired'
  | 'cancelled'

/** How long a pairing QR stays valid. */
export const PAIRING_TTL_MINUTES = 30

/** Containers a phone's MediaRecorder may emit, plus the upload formats. */
export const ACCEPTED_RECORDING_EXT = ['mp4', 'm4a', 'webm', 'ogg', 'wav', 'mp3'] as const

export interface DictationSession {
  id:             string
  clinicId:       string
  vacationItemId: string
  createdBy:      string
  token:          string
  status:         DictationSessionStatus
  deviceLabel?:   string
  audioAssetId?:  string
  expiresAt:      string
  createdAt:      string
  updatedAt:      string
}

/** Minimal, low-PHI context shown on the public (tokenized) phone page. */
export interface MobileDictationContext {
  valid:        boolean
  reason?:      'not_found' | 'expired' | 'completed'
  patientLabel?: string   // deliberately the non-PHI fallback label, never the matched name
  examNumber?:  string
  modality?:    string
  vacationTitle?: string
}
