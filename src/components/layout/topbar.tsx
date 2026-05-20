'use client'

import type { UserRole } from '@/types/user'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  clinic_admin: 'Admin',
  radiologist: 'Radiologist',
  referring_physician: 'Physician',
  technician: 'Technician',
}

interface TopbarUser {
  firstName: string
  lastName: string
  role: UserRole
}

interface TopbarProps {
  onMenuClick: () => void
  user: TopbarUser | null
}

export default function Topbar({ onMenuClick, user }: TopbarProps) {
  const initials = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : '?'
  const displayName = user ? `${user.firstName} ${user.lastName}` : 'User'
  const roleLabel = user ? (ROLE_LABELS[user.role] ?? user.role) : ''

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">

      {/* Left — hamburger on mobile */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
        aria-label="Open navigation"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Desktop spacer */}
      <div className="hidden lg:block" />

      {/* Right */}
      <div className="flex items-center gap-2">

        {/* Notifications */}
        <button
          className="relative p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 mx-1" />

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 select-none">
            {initials}
          </div>
          <div className="hidden sm:block leading-none">
            <p className="text-sm font-medium text-gray-900">{displayName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{roleLabel}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 mx-1" />

        {/* Sign out */}
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="p-2 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
            title="Sign out"
            aria-label="Sign out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </form>

      </div>
    </header>
  )
}
