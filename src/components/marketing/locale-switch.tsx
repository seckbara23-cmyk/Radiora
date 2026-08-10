'use client'

// R2.8 — the ONE locale-switch mechanism, shared by every public/auth surface.
//
// The dashboard Topbar already proved this pattern (router.replace(pathname,
// { locale: next }) via next-intl's own navigation hooks). No public page had
// a switcher at all before R2.8; this extracts that pattern rather than
// inventing a second one, so marketing, login and the dashboard never drift.

import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'

export function LocaleSwitch({ className = '' }: { className?: string }) {
  const t        = useTranslations('actions')
  const locale   = useLocale()
  const router   = useRouter()
  const pathname = usePathname()

  function handleSwitch() {
    const next = locale === 'fr' ? 'en' : 'fr'
    router.replace(pathname, { locale: next })
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      title={t('switchLanguage')}
      aria-label={t('switchLanguage')}
      className={`rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 ${className}`}
    >
      {locale === 'fr' ? 'EN' : 'FR'}
    </button>
  )
}
