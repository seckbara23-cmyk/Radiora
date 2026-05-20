import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import '../globals.css'

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] })

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const isFr = locale === 'fr'
  return {
    title: {
      default: 'Radiora Medical',
      template: '%s | Radiora Medical',
    },
    description: isFr
      ? 'Plateforme de radiologie assistée par IA pour cliniques et équipes de santé.'
      : 'AI-powered radiology reporting platform for clinics and healthcare teams.',
    openGraph: {
      title: 'Radiora Medical',
      description: isFr
        ? 'Plateforme de radiologie assistée par IA pour cliniques et équipes de santé.'
        : 'AI-powered radiology reporting platform for clinics and healthcare teams.',
      type: 'website',
      siteName: 'Radiora Medical',
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${geist.variable} h-full`}>
      <body className="h-full antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
