'use client'

import { useState } from 'react'
import { ImportForm } from './ImportForm'
import { ResultCard } from './ResultCard'
import type { ExternalAiResult, ExternalAiFinding, ExternalAiResultWithFindings } from '@/lib/data/external-ai'

interface Props {
  studyId:     string
  reportId:    string | null
  canManage:   boolean
  initialData: ExternalAiResultWithFindings[]
}

export function ExternalAiClient({ studyId, reportId, canManage, initialData }: Props) {
  const [resultList, setResultList] = useState<ExternalAiResultWithFindings[]>(initialData)

  function handleImported(result: ExternalAiResult, findings: ExternalAiFinding[]) {
    setResultList((prev) => [{ result, findings }, ...prev])
  }

  function handleArchived(resultId: string) {
    setResultList((prev) => prev.filter((r) => r.result.id !== resultId))
  }

  return (
    <div className="space-y-4">

      {canManage && (
        <ImportForm
          studyId={studyId}
          reportId={reportId}
          onImported={handleImported}
        />
      )}

      {resultList.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <p className="text-sm text-gray-500">No external AI results imported for this study yet.</p>
          {canManage && (
            <p className="text-xs text-gray-400 mt-1">Use "Import External AI Result" above to add one.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {resultList.map(({ result, findings }) => (
            <ResultCard
              key={result.id}
              result={result}
              findings={findings}
              reportId={reportId}
              canManage={canManage}
              onArchived={handleArchived}
            />
          ))}
        </div>
      )}

    </div>
  )
}
