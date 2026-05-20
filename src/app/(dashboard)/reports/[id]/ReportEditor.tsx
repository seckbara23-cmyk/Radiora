'use client'

import { useActionState } from 'react'
import { handleReportForm } from '@/lib/actions/reports'
import type { Report } from '@/types/report'

const textareaCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

export function ReportEditor({ report, isAdmin }: { report: Report; isAdmin: boolean }) {
  const isFinalized = report.status === 'finalized'
  const isEditable  = !isFinalized || isAdmin

  const [state, formAction, isPending] = useActionState(handleReportForm, { error: null })

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id"       value={report.id} />
      <input type="hidden" name="study_id" value={report.studyId} />

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        <div>
          <label className={labelCls} htmlFor="findings">Findings *</label>
          <textarea
            id="findings"
            name="findings"
            rows={8}
            disabled={isPending || !isEditable}
            defaultValue={report.findings}
            placeholder="Describe the imaging findings in detail…"
            className={textareaCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="impression">Impression *</label>
          <textarea
            id="impression"
            name="impression"
            rows={4}
            disabled={isPending || !isEditable}
            defaultValue={report.impression}
            placeholder="Summarize the key diagnostic impression…"
            className={textareaCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="recommendations">Recommendations</label>
          <textarea
            id="recommendations"
            name="recommendations"
            rows={3}
            disabled={isPending || !isEditable}
            defaultValue={report.recommendations ?? ''}
            placeholder="Follow-up recommendations (optional)…"
            className={textareaCls}
          />
        </div>

      </div>

      {/* Finalization notice */}
      {isFinalized && report.signedAt && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Report finalized and signed on {report.signedAt.slice(0, 10)}.
          {isAdmin && ' Use "Amend Report" to re-open for editing.'}
        </div>
      )}

      {/* Error / saved feedback */}
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.saved && !state.error && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Draft saved successfully.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        {isFinalized ? (
          isAdmin && (
            <button
              type="submit"
              name="_submit"
              value="amend"
              disabled={isPending}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Opening…' : 'Amend Report'}
            </button>
          )
        ) : (
          <>
            <button
              type="submit"
              name="_submit"
              value="save"
              disabled={isPending}
              className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="submit"
              name="_submit"
              value="finalize"
              disabled={isPending}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {isPending ? 'Finalizing…' : 'Finalize Report'}
            </button>
          </>
        )}
      </div>
    </form>
  )
}
