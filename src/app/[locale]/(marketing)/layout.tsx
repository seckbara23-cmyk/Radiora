import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalBar, SenegalStar } from '@/components/ui/senegal-accents'
import { LocaleSwitch } from '@/components/marketing/locale-switch'

// Phase 5H — public marketing site shell (nav + footer). Wraps Home, Features,
// Pricing, Security and Contact.
//
// R2.8 — the primary header action is now "Se connecter": most visitors to a
// deployed Radiora instance are clinic staff who already have an
// administrator-provisioned or trial account, not first-time shoppers. The
// self-service trial (/signup) is real, working infrastructure — audited, not
// invented — and stays one click away as a secondary link, never removed.

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')
  const tSupport = await getTranslations('support')

  const navLinks = [
    { href: '/#workflow', label: t('nav.workflow') },
    { href: '/features', label: t('nav.features') },
    { href: '/pricing', label: t('nav.pricing') },
    { href: '/security', label: t('nav.security') },
    { href: '/demo', label: t('nav.demo') },
    { href: '/contact', label: t('nav.contact') },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SenegalBar />

      {/* Navigation — calm, no blur/shadow; the accent bar above already marks
          the page as Radiora, so the header itself stays quiet. */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <svg className="h-7 w-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
            <span className="text-lg font-semibold tracking-tight text-gray-900">Radiora Medical</span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-medium text-gray-600 transition hover:text-gray-900">
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <LocaleSwitch className="hidden sm:inline-flex" />
            <Link href="/signup" className="hidden text-sm font-medium text-gray-600 transition hover:text-gray-900 sm:block">
              {t('ctaShort')}
            </Link>
            {/* R2.8 — primary header action: most visitors already have an
                account (administrator-provisioned or trial). */}
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              {t('signIn')}
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer — R2.8 rebuild: one compact row, not a four-column enterprise
          block. The reference footer lists Careers / Help center / Documentation
          / Status / Privacy / Terms, and NONE of those pages exist in this
          repository — shipping them would be six dead links. Only routes that
          actually resolve are linked here; the rest belong to whichever phase
          builds those pages. */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-9 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <span className="font-semibold tracking-tight text-gray-900">Radiora Medical</span>
            </div>
            <p className="mt-2 max-w-sm text-sm text-gray-500">{t('footer.tagline')}</p>
          </div>

          <nav aria-label={t('footer.productHeading')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
            <Link href="/features" className="transition hover:text-gray-900">{t('nav.features')}</Link>
            <Link href="/security" className="transition hover:text-gray-900">{t('nav.security')}</Link>
            <Link href="/pricing" className="transition hover:text-gray-900">{t('nav.pricing')}</Link>
            <Link href="/support" className="transition hover:text-gray-900">{tSupport('title')}</Link>
            <Link href="/contact" className="transition hover:text-gray-900">{t('nav.contact')}</Link>
          </nav>
        </div>

        <div className="border-t border-gray-100">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-4 sm:flex-row sm:gap-3">
            <p className="flex items-center gap-1.5 text-xs text-gray-400">
              <SenegalStar className="text-[#00853F] opacity-70" />
              {t('footer.rights', { year: new Date().getFullYear() })}
            </p>
            <a
              href="https://teranga-tech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 transition hover:text-gray-600"
            >
              {t('footer.builtBy')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
