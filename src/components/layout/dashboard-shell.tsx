'use client'

import { useState } from 'react'
import Sidebar from './sidebar'
import Topbar from './topbar'

interface TopbarUser {
  firstName: string
  lastName: string
  role: string
}

interface DashboardShellProps {
  children: React.ReactNode
  user: TopbarUser | null
}

export default function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-full bg-gray-50">

      {/* Mobile overlay — closes sidebar on backdrop click */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-gray-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/*
        Sidebar wrapper:
        - Mobile: fixed drawer, slides in/out via transform
        - Desktop: relative, always visible as flex item
      */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-30 w-64',
          'transform transition-transform duration-300 ease-in-out',
          'lg:relative lg:translate-x-0 lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} user={user} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

    </div>
  )
}
