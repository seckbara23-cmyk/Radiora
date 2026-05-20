'use client'

import { useActionState } from 'react'
import { setUserStatus } from '@/lib/actions/users'

interface UserActionsProps {
  userId: string
  isActive: boolean
  isSelf: boolean
}

export function UserActions({ userId, isActive, isSelf }: UserActionsProps) {
  const [state, formAction, isPending] = useActionState(setUserStatus, { error: null })

  // Current user's own row — no action available
  if (isSelf) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="user_id"  value={userId} />
        <input type="hidden" name="activate" value={isActive ? '0' : '1'} />
        <button
          type="submit"
          disabled={isPending}
          className={`text-xs font-medium transition disabled:opacity-50 ${
            isActive
              ? 'text-red-500 hover:text-red-700'
              : 'text-emerald-600 hover:text-emerald-800'
          }`}
        >
          {isPending
            ? '…'
            : isActive
              ? 'Deactivate'
              : 'Reactivate'}
        </button>
      </form>
      {state.error && (
        <p className="text-xs text-red-500 max-w-[140px] text-right">{state.error}</p>
      )}
    </div>
  )
}
