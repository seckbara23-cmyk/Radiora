/**
 * Section keys eligible for phrase preferences.
 * 'results' is deliberately excluded — diagnostic findings must never be
 * auto-suggested; the radiologist must type them from scratch each time.
 */
export type PreferenceSection = 'technique' | 'conclusion' | 'indication' | 'recommendations'

export interface UserPhrasePreference {
  id:        string
  userId:    string
  clinicId:  string
  examType?: string        // undefined = applies to all exam types
  section:   PreferenceSection
  label?:    string        // user-given short name for this phrase
  phraseText: string
  useCount:  number
  createdAt: string
}
