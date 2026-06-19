import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

interface Article {
  slug: string
  title: string
  summary: string
  body: string[]
}

// Article slugs are shared across locales (same keys in fr/en).
const SLUGS = ['demarrer', 'comptes-rendus', 'dictee-vocale', 'facturation', 'equipe']

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => SLUGS.map((slug) => ({ locale, slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const t = await getTranslations({ locale, namespace: 'support' })
  const article = (t.raw('articles') as Article[]).find((a) => a.slug === slug)
  return { title: article ? article.title : t('title') }
}

export default async function SupportArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const t = await getTranslations('support')

  const article = (t.raw('articles') as Article[]).find((a) => a.slug === slug)
  if (!article) notFound()

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <Link href="/support" className="text-sm font-medium text-blue-600 transition hover:text-blue-700">
        {t('backToSupport')}
      </Link>

      <article className="mt-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{article.title}</h1>
        <p className="mt-3 text-lg text-gray-500">{article.summary}</p>

        <div className="mt-8 space-y-5">
          {article.body.map((para, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-gray-700">{para}</p>
          ))}
        </div>
      </article>

      <div className="mt-12 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-6 text-center">
        <p className="text-sm text-gray-500">{t('contactDesc')}</p>
        <Link
          href="/contact"
          className="mt-3 inline-block rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {t('contactCta')}
        </Link>
      </div>
    </div>
  )
}
