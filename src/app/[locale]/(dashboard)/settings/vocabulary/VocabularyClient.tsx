'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addVocabularyEntry,
  deleteVocabularyEntry,
  promoteVocabularyEntry,
  type VocabFormState,
} from '@/lib/actions/vocabulary'
import type { VocabularyEntry } from '@/types/vocabulary'

const INITIAL: VocabFormState = { error: null }
type T = ReturnType<typeof useTranslations>

export function VocabularyClient({
  personal,
  clinic,
  isAdmin,
}: {
  personal: VocabularyEntry[]
  clinic: VocabularyEntry[]
  isAdmin: boolean
}) {
  const t = useTranslations('vocabulary')

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('personalTitle')}</h2>
          <p className="text-xs text-gray-500">{t('personalHint')}</p>
        </div>
        <EntryList entries={personal} t={t} canPromote={isAdmin} showOwner={false} />
        <AddForm t={t} scope="personal" isAdmin={isAdmin} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('clinicTitle')}</h2>
          <p className="text-xs text-gray-500">{t('clinicHint')}</p>
        </div>
        <EntryList entries={clinic} t={t} canPromote={false} showOwner={false} />
        {isAdmin && <AddForm t={t} scope="clinic" isAdmin={isAdmin} />}
      </section>
    </div>
  )
}

function confidencePct(c: number): number {
  return Math.round(Math.max(0, Math.min(1, c)) * 100)
}

function EntryList({
  entries,
  t,
  canPromote,
  showOwner,
}: {
  entries: VocabularyEntry[]
  t: T
  canPromote: boolean
  showOwner: boolean
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-400">
        {t('empty')}
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 font-medium">{t('colSource')}</th>
            <th className="px-4 py-2 font-medium">{t('colTarget')}</th>
            <th className="px-4 py-2 font-medium">{t('colKind')}</th>
            <th className="px-4 py-2 font-medium">{t('colModality')}</th>
            <th className="px-4 py-2 font-medium">{t('colFrequency')}</th>
            <th className="px-4 py-2 font-medium">{t('colConfidence')}</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 text-gray-500 line-through">{e.sourceText}</td>
              <td className="px-4 py-2 font-medium text-gray-900">{e.targetText}</td>
              <td className="px-4 py-2 text-gray-500">{t(`kind_${e.kind}`)}</td>
              <td className="px-4 py-2 text-gray-500">{e.modality || t('modalityAll')}</td>
              <td className="px-4 py-2 text-gray-500">{e.frequency}×</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${confidencePct(e.confidence)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400">{confidencePct(e.confidence)}%</span>
                </div>
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-3">
                  {canPromote && <PromoteEntry id={e.id} t={t} />}
                  {showOwner && <span />}
                  <DeleteEntry id={e.id} t={t} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DeleteEntry({ id, t }: { id: string; t: T }) {
  const [state, formAction, isPending] = useActionState(deleteVocabularyEntry, INITIAL)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {state.error && <span className="mr-2 text-[11px] text-red-600">{state.error}</span>}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-gray-300 transition hover:text-red-600"
      >
        {isPending ? '…' : t('delete')}
      </button>
    </form>
  )
}

function PromoteEntry({ id, t }: { id: string; t: T }) {
  const [state, formAction, isPending] = useActionState(promoteVocabularyEntry, INITIAL)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {state.error && <span className="mr-2 text-[11px] text-red-600">{state.error}</span>}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-violet-500 transition hover:text-violet-700"
        title={t('promoteHint')}
      >
        {isPending ? '…' : t('promote')}
      </button>
    </form>
  )
}

function AddForm({ t, scope, isAdmin }: { t: T; scope: 'personal' | 'clinic'; isAdmin: boolean }) {
  const [state, formAction, isPending] = useActionState(addVocabularyEntry, INITIAL)
  const input =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500'
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">
        {scope === 'clinic' ? t('addClinicTitle') : t('addPersonalTitle')}
      </h3>
      <p className="mt-1 text-xs text-gray-500">{t('addHint')}</p>
      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="scope" value={scope} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldSource')} *</span>
            <input name="source" required className={input} placeholder={t('sourcePlaceholder')} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldTarget')} *</span>
            <input name="target" required className={input} placeholder={t('targetPlaceholder')} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldKind')}</span>
            <select name="kind" defaultValue="phrase" className={input}>
              <option value="word">{t('kind_word')}</option>
              <option value="phrase">{t('kind_phrase')}</option>
              <option value="spelling">{t('kind_spelling')}</option>
              <option value="terminology">{t('kind_terminology')}</option>
              <option value="conclusion">{t('kind_conclusion')}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldModality')}</span>
            <input name="modality" className={input} placeholder={t('modalityPlaceholder')} />
          </label>
        </div>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.saved && <p className="text-xs text-green-600">{t('added')}</p>}
        <button
          type="submit"
          disabled={isPending || (scope === 'clinic' && !isAdmin)}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {isPending ? '…' : t('add')}
        </button>
      </form>
    </section>
  )
}
