import { getTranslations, setRequestLocale } from 'next-intl/server'
import { RadioraDemo } from '@/components/marketing/radiora-demo'
import { ResultsBanner } from '@/components/marketing/landing-sections'

// Public interactive AI demo. Lives under the (marketing) route group, which is
// NOT in the middleware PROTECTED_SEGMENTS list — so it is public by construction
// (no auth gate added or bypassed). The demo is fully client-side and never
// touches the database or any internal report API.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'demo' })
  return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <section className="bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <ResultsBanner />
        <div className="mt-12">
          <RadioraDemo />
        </div>
      </div>
    </section>
  )
}
