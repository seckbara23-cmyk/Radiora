import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

interface Article {
  slug: string
  title: string
  summary: string
}

interface Tutorial {
  title: string
  duration: string
  desc: string
}

interface Faq {
  q: string
  a: string
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'support' })
  return { title: t('title') }
}

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('support')

  const articles = t.raw('articles') as Article[]
  const tutorials = t.raw('tutorials') as Tutorial[]
  const faqs = t.raw('faqs') as Faq[]

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('title')}</h1>
        <p className="mt-4 text-lg text-gray-500">{t('subtitle')}</p>
      </div>

      {/* Knowledge base */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold text-gray-900">{t('kbHeading')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('kbSubtitle')}</p>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/support/${article.slug}`}
              className="group rounded-2xl border border-gray-100 bg-white p-6 transition hover:border-blue-200 hover:shadow-sm"
            >
              <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-700">{article.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{article.summary}</p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-600">{t('readArticle')} →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Video tutorials */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold text-gray-900">{t('tutorialsHeading')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('tutorialsSubtitle')}</p>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tutorials.map((tut, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                <svg className="h-10 w-10 text-blue-500/70" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                  {t('tutorialBadge')}
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {tut.duration}
                </span>
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900">{tut.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{tut.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold text-gray-900">{t('faqHeading')}</h2>
        <div className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
          {faqs.map((faq, i) => (
            <details key={i} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-900">
                {faq.q}
                <svg
                  className="h-4 w-4 flex-shrink-0 text-gray-400 transition group-open:rotate-180"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-gray-500">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact support */}
      <section className="mt-16 rounded-2xl border border-gray-100 bg-gray-50 px-8 py-10 text-center">
        <h2 className="text-lg font-semibold text-gray-900">{t('contactHeading')}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-gray-500">{t('contactDesc')}</p>
        <Link
          href="/contact"
          className="mt-5 inline-block rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
        >
          {t('contactCta')}
        </Link>
      </section>
    </div>
  )
}
