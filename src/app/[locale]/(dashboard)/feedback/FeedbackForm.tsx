'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { submitFeedback, type FeedbackFormState } from '@/lib/actions/feedback'
import { FEEDBACK_CATEGORIES, FEEDBACK_PRIORITIES } from '@/types/pilot'

const INITIAL: FeedbackFormState = { error: null }

export function FeedbackForm() {
  const t = useTranslations('feedback')
  const [state, formAction, isPending] = useActionState(submitFeedback, INITIAL)

  const field =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  if (state.submitted && !state.error) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="mt-3 text-sm font-medium text-emerald-800">{t('success')}</p>
        <a href="" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
          {t('another')}
        </a>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('category')}</span>
          <select name="category" defaultValue="workflow" className={field}>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">{t('priority')}</span>
          <select name="priority" defaultValue="important" className={field}>
            {FEEDBACK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{t(`priorities.${p}`)}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">{t('message')}</span>
        <textarea
          name="message"
          rows={5}
          required
          placeholder={t('messagePlaceholder')}
          className={`${field} resize-y`}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
