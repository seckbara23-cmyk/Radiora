import { setRequestLocale } from 'next-intl/server'
import { AcceptInviteClient } from './AcceptInviteClient'

// Public invite-acceptance route. Lives in the (auth) group and is NOT in the
// middleware PROTECTED_SEGMENTS list, so it renders even when another session is
// already active — which is exactly what lets us detect the conflict and avoid
// silently dropping the invitee into the current admin's dashboard.
//
// The page is intentionally dynamic: it reads the Supabase token fragment from
// the URL on the client, so there is nothing to statically prerender.
export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <AcceptInviteClient />
}
