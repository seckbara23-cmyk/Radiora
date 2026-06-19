import type { VocabularyKind } from '@/lib/ai/vocabulary'

export type VocabularyScope = 'personal' | 'clinic'

// A persisted vocabulary memory entry (one wording correction the radiologist —
// or the clinic — prefers). See src/lib/ai/vocabulary.ts for the safety rules
// that govern what may ever be stored here.
export interface VocabularyEntry {
  id:          string
  clinicId:    string
  /** null = clinic-wide shared entry; otherwise the owning radiologist. */
  userId:      string | null
  scope:       VocabularyScope
  kind:        VocabularyKind
  /** null = applies to every modality. */
  modality:    string | null
  sourceText:  string
  targetText:  string
  frequency:   number
  confidence:  number
  lastUsedAt:  string | null
  createdAt:   string
  updatedAt:   string
}
