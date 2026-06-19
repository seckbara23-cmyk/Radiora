import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ContactForm } from './ContactForm'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing' })
  return { title: t('nav.contact') }
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('marketing')

  const channels = [
    { label: t('contact.emailLabel'), value: t('contact.email'), href: `mailto:${t('contact.email')}` },
    { label: t('contact.phoneLabel'), value: t('contact.phone'), href: `tel:${t('contact.phone').replace(/\s/g, '')}` },
    { label: t('contact.locationLabel'), value: t('contact.location'), href: null },
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('contact.title')}</h1>
        <p className="mt-4 text-lg text-gray-500">{t('contact.subtitle')}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Channels */}
        <div className="space-y-8">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('contact.ownersHeading')}</h2>
            <p className="mt-2 text-base font-medium text-gray-900">{t('contact.owners')}</p>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('contact.channelsHeading')}</h2>
            <dl className="mt-3 space-y-3">
              {channels.map((c) => (
                <div key={c.label} className="flex items-baseline gap-3">
                  <dt className="w-24 flex-shrink-0 text-sm text-gray-400">{c.label}</dt>
                  <dd className="text-sm text-gray-800">
                    {c.href ? (
                      <a href={c.href} className="text-blue-600 transition hover:text-blue-700">{c.value}</a>
                    ) : (
                      c.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">{t('contact.formHeading')}</h2>
          <ContactForm
            locale={locale}
            labels={{
              name: t('contact.name'),
              email: t('contact.emailField'),
              clinic: t('contact.clinic'),
              message: t('contact.message'),
              submit: t('contact.submit'),
              sending: t('contact.sending'),
              successTitle: t('contact.successTitle'),
              successBody: t('contact.successBody'),
              error: t('contact.error'),
            }}
          />
        </div>
      </div>
    </div>
  )
}
