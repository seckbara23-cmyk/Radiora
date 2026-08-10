'use client'

// R2.5 — what the doctor is told about one section during live dictation.
//
// The vocabulary is clinical, not technical: no revision numbers, no parser or
// model names, no confidence decimals. Each chip answers "why am I being asked
// to look at this?", and a held-back proposal is always accept/reject — never a
// silent write.

import { useTranslations } from 'next-intl'
import type { SectionKey } from '@/lib/safety/sections'
import type { LiveFlagCode, SectionSuggestion } from '@/lib/reports/live-coordinator'

interface Props {
  section: SectionKey
  flags: LiveFlagCode[]
  suggestion?: SectionSuggestion
  /** The radiologist owns this section — live AI is paused for it. */
  owned: boolean
  disabled: boolean
  onAccept: (key: SectionKey) => void
  onReject: (key: SectionKey) => void
  onResumeAi: (key: SectionKey) => void
}

/** Chips read worst-first so the most important reason is closest to the text. */
const FLAG_ORDER: LiveFlagCode[] = [
  'physicianOwned',
  'ambiguousCorrection',
  'rewrite',
  'sectionReassigned',
  'autoFilled',
  'inferredConclusion',
  'cleanupDrift',
  'lowConfidence',
]

const TONE: Record<LiveFlagCode, string> = {
  physicianOwned:      'border-slate-300 bg-slate-50 text-slate-700',
  ambiguousCorrection: 'border-amber-300 bg-amber-50 text-amber-800',
  rewrite:             'border-amber-300 bg-amber-50 text-amber-800',
  sectionReassigned:   'border-amber-300 bg-amber-50 text-amber-800',
  autoFilled:          'border-blue-300 bg-blue-50 text-blue-800',
  inferredConclusion:  'border-blue-300 bg-blue-50 text-blue-800',
  cleanupDrift:        'border-amber-300 bg-amber-50 text-amber-800',
  lowConfidence:       'border-blue-300 bg-blue-50 text-blue-800',
}

export function LiveSectionStatus({
  section, flags, suggestion, owned, disabled, onAccept, onReject, onResumeAi,
}: Props) {
  const t = useTranslations('live')
  if (flags.length === 0 && !suggestion && !owned) return null

  const ordered = FLAG_ORDER.filter((f) => flags.includes(f))

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 font-sans">
      {owned && (
        <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {t('editedByYou')}
        </span>
      )}

      {ordered
        .filter((f) => !(f === 'physicianOwned' && owned)) // already said above
        .map((f) => (
          <span
            key={f}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE[f]}`}
          >
            {t(`flag.${f}` as Parameters<typeof t>[0])}
          </span>
        ))}

      {suggestion && (
        <span className="inline-flex items-center gap-1">
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
            {t('aiSuggestion')}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAccept(section)}
            className="rounded-full border border-indigo-300 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            {t('accept')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onReject(section)}
            className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
          >
            {t('reject')}
          </button>
        </span>
      )}

      {owned && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResumeAi(section)}
          className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
        >
          {t('resumeAi')}
        </button>
      )}

      {/* The proposal itself, so "accept" is never a blind choice. */}
      {suggestion && (
        <p className="w-full rounded border border-indigo-100 bg-indigo-50/50 px-2 py-1 text-[11px] leading-snug text-slate-700">
          {suggestion.text}
        </p>
      )}
    </div>
  )
}
