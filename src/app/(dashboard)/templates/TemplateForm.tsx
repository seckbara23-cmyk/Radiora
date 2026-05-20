'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { saveTemplate } from '@/lib/actions/templates'
import type { Template } from '@/types/template'

const MODALITIES = ['CT', 'MRI', 'XR', 'US', 'NM', 'PT', 'MG', 'DX', 'CR'] as const

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500'
const textareaCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

interface Props {
  initialData?: Template
}

export function TemplateForm({ initialData }: Props) {
  const [state, formAction, isPending] = useActionState(saveTemplate, { error: null })
  const isEdit = !!initialData?.id

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <form action={formAction} className="space-y-5">

        {/* Hidden id — empty string means "create" */}
        <input type="hidden" name="id" value={initialData?.id ?? ''} />

        {state.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Title */}
        <div>
          <label className={labelCls} htmlFor="title">Template Title *</label>
          <input
            id="title" name="title" required
            defaultValue={initialData?.title ?? ''}
            placeholder="e.g. Chest XR — Normal"
            disabled={isPending} className={inputCls}
          />
        </div>

        {/* Modality + Body Part */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="modality">Modality</label>
            <select
              id="modality" name="modality"
              defaultValue={initialData?.modality ?? ''}
              disabled={isPending} className={inputCls}
            >
              <option value="">Any modality (generic)</option>
              {MODALITIES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="body_part">Body Part</label>
            <input
              id="body_part" name="body_part"
              defaultValue={initialData?.bodyPart ?? ''}
              placeholder="e.g. Chest, Abdomen, Brain"
              disabled={isPending} className={inputCls}
            />
          </div>
        </div>

        {/* Findings Template */}
        <div>
          <label className={labelCls} htmlFor="findings_template">Findings Template *</label>
          <textarea
            id="findings_template" name="findings_template" rows={7} required
            defaultValue={initialData?.findingsTemplate ?? ''}
            placeholder="Standard findings text for this study type…"
            disabled={isPending} className={textareaCls}
          />
        </div>

        {/* Impression Template */}
        <div>
          <label className={labelCls} htmlFor="impression_template">Impression Template *</label>
          <textarea
            id="impression_template" name="impression_template" rows={4} required
            defaultValue={initialData?.impressionTemplate ?? ''}
            placeholder="Standard impression for this study type…"
            disabled={isPending} className={textareaCls}
          />
        </div>

        {/* Recommendations Template */}
        <div>
          <label className={labelCls} htmlFor="recommendations_template">Recommendations Template</label>
          <textarea
            id="recommendations_template" name="recommendations_template" rows={3}
            defaultValue={initialData?.recommendationsTemplate ?? ''}
            placeholder="Standard follow-up recommendations (optional)…"
            disabled={isPending} className={textareaCls}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <Link
            href="/templates"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </button>
        </div>

      </form>
    </div>
  )
}
