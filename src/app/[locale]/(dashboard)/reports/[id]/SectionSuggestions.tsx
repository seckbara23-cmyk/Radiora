'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveUserPhrase, deleteUserPhrase, incrementPhraseUse } from '@/lib/actions/preferences'
import type { UserPhrasePreference, PreferenceSection } from '@/types/preference'

interface Props {
  section:     PreferenceSection
  examType?:   string
  reportId:    string
  currentText: string
  phrases:     UserPhrasePreference[]
  onApply:     (text: string) => void
  disabled:    boolean
}

/**
 * Inline phrase preferences for non-diagnostic sections.
 * Shows saved phrases as clickable chips above a section textarea.
 * Physicians explicitly save phrases they want to reuse — nothing is
 * auto-suggested or auto-applied; all actions require a click.
 */
export function SectionSuggestions({
  section, examType, reportId, currentText, phrases: initialPhrases, onApply, disabled,
}: Props) {
  const t = useTranslations('reportEditor')

  const [phrases,      setPhrases]      = useState(initialPhrases)
  const [showSave,     setShowSave]     = useState(false)
  const [saveLabel,    setSaveLabel]    = useState('')
  const [savedNotice,  setSavedNotice]  = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()

  function handleApply(phrase: UserPhrasePreference) {
    if (disabled) return
    onApply(phrase.phraseText)
    startTransition(async () => {
      await incrementPhraseUse(phrase.id)
      setPhrases((prev) =>
        [...prev.map((p) => p.id === phrase.id ? { ...p, useCount: p.useCount + 1 } : p)]
          .sort((a, b) => b.useCount - a.useCount),
      )
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteUserPhrase(id)
      if (!res.error) setPhrases((prev) => prev.filter((p) => p.id !== id))
    })
  }

  function handleSave() {
    const text = currentText.trim()
    if (!text) return
    setSaveError(null)
    startTransition(async () => {
      const res = await saveUserPhrase(section, text, {
        examType,
        label:    saveLabel.trim() || undefined,
        reportId,
      })
      if (res.error) {
        setSaveError(res.error)
        return
      }
      const newPhrase: UserPhrasePreference = {
        id:         res.id!,
        userId:     '',
        clinicId:   '',
        examType,
        section,
        label:      saveLabel.trim() || undefined,
        phraseText: text,
        useCount:   0,
        createdAt:  new Date().toISOString(),
      }
      setPhrases((prev) => [newPhrase, ...prev])
      setSaveLabel('')
      setShowSave(false)
      setSavedNotice(true)
      setTimeout(() => setSavedNotice(false), 2500)
    })
  }

  // Nothing to show when disabled and no saved phrases exist.
  if (disabled && phrases.length === 0) return null

  return (
    <div className="mb-2.5 space-y-1.5">
      {/* ── Phrase chips row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
        {/* Save toggle */}
        {!disabled && (
          <button
            type="button"
            onClick={() => { setShowSave((v) => !v); setSaveError(null) }}
            title={t('savePhrase')}
            className="shrink-0 w-5 h-5 rounded-full border border-gray-300 hover:border-blue-400 text-gray-400 hover:text-blue-500 flex items-center justify-center leading-none text-[13px] transition"
          >
            {showSave ? '×' : '+'}
          </button>
        )}

        {phrases.map((phrase) => (
          <div key={phrase.id} className="group flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => handleApply(phrase)}
              disabled={disabled || isPending}
              title={phrase.phraseText}
              className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 truncate max-w-[200px] transition disabled:opacity-50"
            >
              {phrase.label ?? (phrase.phraseText.length > 32 ? phrase.phraseText.slice(0, 32) + '…' : phrase.phraseText)}
            </button>
            {!disabled && (
              <button
                type="button"
                onClick={() => handleDelete(phrase.id)}
                title={t('deletePhrase')}
                className="opacity-0 group-hover:opacity-100 ml-0.5 text-gray-300 hover:text-red-400 text-[11px] leading-none transition"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {savedNotice && (
          <span className="text-[11px] text-green-600 font-medium">{t('phraseSaved')}</span>
        )}

        {phrases.length === 0 && !showSave && !disabled && (
          <span className="text-[11px] text-gray-400 italic">{t('noPhrasesYet')}</span>
        )}
      </div>

      {/* ── Inline save form ─────────────────────────────────────────────── */}
      {showSave && !disabled && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span className="shrink-0 text-[11px] font-medium text-blue-700">{t('savePhraseLabel')}</span>
          <input
            type="text"
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
            placeholder={t('savePhraseHint')}
            maxLength={40}
            className="flex-1 min-w-0 text-xs border border-blue-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !currentText.trim()}
            className="shrink-0 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded px-3 py-1 transition"
          >
            {t('savePhraseConfirm')}
          </button>
        </div>
      )}

      {saveError && (
        <p className="text-[11px] text-red-600">{saveError}</p>
      )}
    </div>
  )
}
