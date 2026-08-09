// R0.4 — print route group.
//
// Deliberately OUTSIDE the (dashboard) group: the print page is a document, not
// an app screen. Rendering it inside DashboardShell put the sidebar and topbar
// around the "paper" and wrapped it in an `overflow-y-auto` scroll container,
// which commonly clips a multi-page report to a single printed page. This
// layout is a pass-through — the parent [locale] layout still supplies <html>,
// <body> and the next-intl provider.

import { setRequestLocale } from 'next-intl/server'

export default async function PrintLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <>{children}</>
}
