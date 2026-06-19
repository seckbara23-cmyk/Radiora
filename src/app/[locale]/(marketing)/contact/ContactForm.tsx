'use client'

import { useActionState } from 'react'
import { submitContactInquiry, type ContactState } from '@/lib/actions/contact'

interface Labels {
  name: string
  email: string
  clinic: string
  message: string
  submit: string
  sending: string
  successTitle: string
  successBody: string
  error: string
}

export function ContactForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(
    submitContactInquiry,
    {},
  )

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-4 text-base font-semibold text-emerald-900">{labels.successTitle}</h3>
        <p className="mt-1 text-sm text-emerald-700">{labels.successBody}</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">{labels.name}</label>
        <input
          id="name" name="name" type="text" required maxLength={120}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">{labels.email}</label>
        <input
          id="email" name="email" type="email" required maxLength={120}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="clinic" className="block text-sm font-medium text-gray-700">{labels.clinic}</label>
        <input
          id="clinic" name="clinic" type="text" maxLength={160}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700">{labels.message}</label>
        <textarea
          id="message" name="message" required rows={5} maxLength={4000}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{labels.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  )
}
