import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Radiora Medical',
    template: '%s | Radiora Medical',
  },
  description: 'AI-powered radiology reporting platform for clinics and healthcare teams.',
  openGraph: {
    title: 'Radiora Medical',
    description: 'AI-powered radiology reporting platform for clinics and healthcare teams.',
    type: 'website',
    siteName: 'Radiora Medical',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
