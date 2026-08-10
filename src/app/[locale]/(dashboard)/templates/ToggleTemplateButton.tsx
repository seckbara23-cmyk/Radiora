'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { toggleTemplate } from '@/lib/actions/templates'

export function ToggleTemplateButton({
  id,
  isActive,
}: {
  id: string
  isActive: boolean
}) {
  const t = useTranslations('templates')
  const [state, formAction, isPending] = useActionState(toggleTemplate, { error: null })

  return (
    <form action={formAction}>
      <input type="hidden" name="id"       value={id} />
      <input type="hidden" name="activate" value={isActive ? '0' : '1'} />
      {state.error && (
        <p className="text-xs text-red-600 mb-1">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className={`text-xs font-medium transition ${
          isActive
            ? 'text-gray-400 hover:text-red-600'
            : 'text-gray-400 hover:text-green-600'
        }`}
      >
        {isPending ? '…' : isActive ? t('deactivate') : t('activate')}
      </button>
    </form>
  )
}
