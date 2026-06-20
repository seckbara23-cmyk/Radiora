import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalBar, SenegalStar } from '@/components/ui/senegal-accents'

// Phase 5H — public marketing site shell (nav + footer). Wraps Home, Features,
// Pricing, Security and Contact. The primary CTA always points at the public
// self-service onboarding (/signup → 30-day free trial).

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
    { href: '/demo', label: t('nav.demo') },
    { href: '/features', label: t('nav.features') },
    { href: '/pricing', label: t('nav.pricing') },
    { href: '/security', label: t('nav.security') },
    { href: '/support', label: tSupport('title') },
    { href: '/contact', label: t('nav.contact') },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SenegalBar />

      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
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
            <Link href="/login" className="hidden text-sm font-medium text-gray-600 transition hover:text-gray-900 sm:block">
              {t('signIn')}
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              {t('ctaShort')}
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <span className="font-semibold tracking-tight text-gray-900">Radiora Medical</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-gray-500">{t('footer.tagline')}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('footer.productHeading')}</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li><Link href="/features" className="transition hover:text-gray-900">{t('nav.features')}</Link></li>
              <li><Link href="/pricing" className="transition hover:text-gray-900">{t('nav.pricing')}</Link></li>
              <li><Link href="/security" className="transition hover:text-gray-900">{t('nav.security')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('footer.companyHeading')}</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li><Link href="/support" className="transition hover:text-gray-900">{tSupport('title')}</Link></li>
              <li><Link href="/contact" className="transition hover:text-gray-900">{t('nav.contact')}</Link></li>
              <li><Link href="/login" className="transition hover:text-gray-900">{t('signIn')}</Link></li>
              <li><Link href="/signup" className="transition hover:text-gray-900">{t('ctaShort')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-100">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 sm:flex-row sm:gap-3">
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
