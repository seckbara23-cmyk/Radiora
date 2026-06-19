'use client'

import { useActionState } from 'react'
import { resendInvite } from '@/lib/actions/users'

interface ResendInviteProps {
  userId: string
  labels: { resend: string; resending: string; resent: string }
}

export function ResendInvite({ userId, labels }: ResendInviteProps) {
  const [state, formAction, isPending] = useActionState(resendInvite, { error: null })
  const sent = !isPending && !state.error && state.submitted

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="user_id" value={userId} />
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 transition disabled:opacity-50"
        >
          {isPending ? labels.resending : sent ? labels.resent : labels.resend}
        </button>
      </form>
      {state.error && (
        <p className="text-xs text-red-500 max-w-[140px] text-right">{state.error}</p>
      )}
    </div>
  )
}
