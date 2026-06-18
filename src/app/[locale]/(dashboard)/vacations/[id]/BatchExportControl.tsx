'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

// Feature 9 — batch export of a vacation's reports to a ZIP of PDFs.
// Only report-bearing items are passed in. Selection defaults to all; a status
// filter lets the user narrow to e.g. validated / signed before exporting.
export interface BatchExportItem {
  reportId: string
  label: string
  examNumber: string
  status: string
}

export function BatchExportControl({
  items,
  vacationDate,
}: {
  items: BatchExportItem[]
  vacationDate: string
}) {
  const te = useTranslations('reportExport')
  const tq = useTranslations('vacationQueue')

  const statuses = useMemo(() => [...new Set(items.map((i) => i.status))], [items])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const visible = useMemo(
    () => (statusFilter === 'all' ? items : items.filter((i) => i.status === statusFilter)),
    [items, statusFilter],
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.reportId)))

  if (items.length === 0) return null

  const visibleIds = visible.map((i) => i.reportId)
  const allVisibleSelected = visibleIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  function exportZip() {
    const ids = visibleIds.filter((id) => selected.has(id))
    if (ids.length === 0) return
    const params = new URLSearchParams({ ids: ids.join(','), date: vacationDate })
    const a = document.createElement('a')
    a.href = `/api/vacations/export?${params.toString()}`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const selectedCount = visibleIds.filter((id) => selected.has(id)).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{te('batchTitle')}</h2>
          <p className="text-xs text-gray-500">{te('batchHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700"
          >
            <option value="all">{te('allStatuses')}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {tq(`status.${s}` as Parameters<typeof tq>[0])}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportZip}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            <span aria-hidden>🗜️</span> {te('batchExport', { count: selectedCount })}
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-100">
        <label className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="rounded" />
          {te('selectAll')}
        </label>
        {visible.map((i) => (
          <label key={i.reportId} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selected.has(i.reportId)}
              onChange={() => toggle(i.reportId)}
              className="rounded"
            />
            <span className="flex-1 truncate text-gray-800">{i.label}</span>
            {i.examNumber && <span className="font-mono text-xs text-gray-400">{i.examNumber}</span>}
            <span className="text-xs text-gray-500">
              {tq(`status.${i.status}` as Parameters<typeof tq>[0])}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
