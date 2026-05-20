'use client'

interface TopbarProps {
  onMenuClick: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
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
            SC
          </div>
          <div className="hidden sm:block leading-none">
            <p className="text-sm font-medium text-gray-900">Dr. Sarah Chen</p>
            <p className="text-xs text-gray-400 mt-0.5">Radiologist</p>
          </div>
          <svg className="hidden sm:block w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

      </div>
    </header>
  )
}
