import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SenegalBar, SenegalStar } from '@/components/ui/senegal-accents'

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')

  const features = [
    {
      titleKey:   'secureTitle' as const,
      descKey:    'secureDesc' as const,
      iconColor:  'bg-emerald-50 text-emerald-700',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
    },
    {
      titleKey:   'fastTitle' as const,
      descKey:    'fastDesc' as const,
      iconColor:  'bg-amber-50 text-amber-700',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />,
    },
    {
      titleKey:   'multiTitle' as const,
      descKey:    'multiDesc' as const,
      iconColor:  'bg-blue-50 text-blue-600',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
    },
  ]

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">

      {/* Senegal tricolor accent bar */}
      <SenegalBar />

      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
          <span className="font-semibold text-gray-900 text-lg tracking-tight">Radiora Medical</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">
          {t('signIn')}
        </Link>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 max-w-3xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 mb-8">
          <SenegalStar className="text-[#00853F]" />
          {t('tagline')}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
          {t('hero')}{' '}
          <span className="text-blue-600">{t('heroHighlight')}</span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl leading-relaxed">{t('heroDesc')}</p>
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link href="/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition shadow-sm shadow-blue-600/20">
            {t('signInDashboard')}
          </Link>
          <Link href="/login"
            className="px-6 py-3 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-100 transition">
            {t('contactSales')}
          </Link>
        </div>

        {/* Regional anchor */}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <SenegalStar className="text-[#00853F] opacity-70" />
          Conçu pour les cliniques et centres d&apos;imagerie en Afrique francophone
        </p>
      </section>

      <section className="border-t border-gray-100 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.titleKey} className="flex gap-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${f.iconColor} flex items-center justify-center`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {f.icon}
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t(f.titleKey)}</h3>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">{t(f.descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-100">
        <SenegalBar className="opacity-60" />
        <div className="px-6 py-5 text-center">
          <p className="text-xs text-gray-400">{t('copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>

    </main>
  )
}
