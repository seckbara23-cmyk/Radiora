// Root layout: minimal pass-through.
// html/body tags with correct lang attribute live in src/app/[locale]/layout.tsx.
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
