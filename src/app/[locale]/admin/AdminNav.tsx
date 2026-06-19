'use client'

import { Link, usePathname } from '@/i18n/navigation'

interface NavItem {
  href: string
  label: string
}

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
