// Feature 2 (audio ingestion) + Feature 6 (transcription) types.

import type { StructuredReportData } from '@/types/report'
import type { CorrectionEvent, SectionConfidence } from '@/types/structuring'

/** How the audio entered the system. */
export type IngestionMode = 'single' | 'batch' | 'long'

export type AudioAssetStatus = 'uploaded' | 'assigned' | 'transcribed' | 'archived'

export type TranscriptionStatus = 'draft' | 'secretary_reviewed' | 'radiologist_reviewed'

/** Private Supabase Storage bucket holding dictation audio. Never public. */
export const AUDIO_BUCKET = 'dictation-audio'

/** Accepted dictation formats (spec: MP3 / MP4 / WAV / M4A). */
export const ACCEPTED_AUDIO_EXT = ['mp3', 'mp4', 'wav', 'm4a'] as const

export const ACCEPTED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/m4a',
  'audio/x-m4a',
  'video/mp4',
  'application/octet-stream',
] as const

/** 100 MB — matches the bucket's file_size_limit in migration 018. */
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024

export interface AudioAsset {
  id:               string
  clinicId:         string
  vacationId?:      string
  uploadedBy:       string
  originalFilename: string
  mimeType:         string
  fileSizeBytes:    number
  durationSeconds?: number
  storagePath:      string
  ingestionMode:    IngestionMode
  status:           AudioAssetStatus
  createdAt:        string
  updatedAt:        string
}

export interface Transcription {
  id:             string
  clinicId:       string
  vacationItemId: string
  audioAssetId?:  string
  language:       string
  rawText:        string
  correctedText:  string
  status:         TranscriptionStatus
  createdBy:      string
  reviewedBy?:    string
  createdAt:      string
  updatedAt:      string
  // Feature 7 — structuring layers.
  cleanedText?:      string
  correctionEvents?: CorrectionEvent[]
  structuredJson?:   StructuredReportData | null
  confidence?:       SectionConfidence[]
  structuredAt?:     string
  structuredBy?:     string
}
