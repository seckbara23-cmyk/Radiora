'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { addCustomExam, toggleCustomExam } from '@/lib/actions/exam-catalog'
import { MODALITY_LABELS, MODALITY_ORDER, type ExamCatalogEntry, type ExamModality } from '@/types/exam'

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function ExamCatalogClient({
  entries,
  locale,
  isAdmin,
}: {
  entries: ExamCatalogEntry[]
  locale: string
  isAdmin: boolean
}) {
  const t = useTranslations('exams')
  const [query, setQuery] = useState('')
  const lang = locale === 'en' ? 'en' : 'fr'

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return entries
    return entries.filter(
      (e) => normalize(e.title).includes(q) || normalize(e.examType).includes(q),
    )
  }, [entries, query])

  const groups = useMemo(
    () =>
      MODALITY_ORDER.map((modality) => ({
        modality,
        exams: filtered.filter((e) => e.modality === modality),
      })).filter((g) => g.exams.length > 0),
    [filtered],
  )

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search')}
        className="w-full max-w-md rounded-lg border border-gray-300 px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-400">
          {t('noResults')}
        </p>
      ) : (
        groups.map((g) => (
          <ModalityGroup key={g.modality} modality={g.modality} exams={g.exams} lang={lang} isAdmin={isAdmin} t={t} />
        ))
      )}

      {isAdmin && <AddExamForm t={t} />}
    </div>
  )
}

function ModalityGroup({
  modality,
  exams,
  lang,
  isAdmin,
  t,
}: {
  modality: ExamModality
  exams: ExamCatalogEntry[]
  lang: 'fr' | 'en'
  isAdmin: boolean
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {MODALITY_LABELS[modality][lang]}
        </span>
        <span className="text-xs font-normal text-gray-400">{exams.length}</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {exams.map((e) => (
              <tr key={e.examType} className={e.isActive === false ? 'opacity-50' : ''}>
                <td className="px-5 py-3 align-top">
                  <div className="font-medium text-gray-900">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {e.isCustom && (
                      <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                        {t('custom')}
                      </span>
                    )}
                    {e.specialLayout && (
                      <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        {t('special')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-5 py-3 align-top text-xs text-gray-500 md:table-cell">
                  {e.defaultTechnique}
                </td>
                {isAdmin && (
                  <td className="px-5 py-3 text-right align-top">
                    {e.isCustom && e.id ? (
                      <ToggleExam id={e.id} isActive={e.isActive !== false} t={t} />
                    ) : (
                      <span className="text-[11px] text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ToggleExam({
  id,
  isActive,
  t,
}: {
  id: string
  isActive: boolean
  t: ReturnType<typeof useTranslations>
}) {
  const [state, formAction, isPending] = useActionState(toggleCustomExam, { error: null })
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activate" value={isActive ? '0' : '1'} />
      {state.error && <p className="mb-1 text-[11px] text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className={`text-xs font-medium transition ${
          isActive ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'
        }`}
      >
        {isPending ? '…' : isActive ? t('deactivate') : t('reactivate')}
      </button>
    </form>
  )
}

function AddExamForm({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [state, formAction, isPending] = useActionState(addCustomExam, { error: null })
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">{t('addTitle')}</h2>
      <p className="mt-1 text-xs text-gray-500">{t('addHint')}</p>
      <form action={formAction} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldLabel')}</span>
            <input
              name="title"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fieldModality')}</span>
            <select
              name="modality"
              defaultValue="CT"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {MODALITY_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MODALITY_LABELS[m].fr}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('fieldTechnique')}</span>
          <textarea
            name="default_technique"
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.saved && <p className="text-xs text-green-600">{t('added')}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? '…' : t('add')}
        </button>
      </form>
    </section>
  )
}
