// Reusable Senegal-inspired accent components.
// Colors: green #00853F (flag) | gold #D4A017 (warm) | red #E31837 (controlled use only)
// All elements are aria-hidden — purely decorative.

export function SenegalBar({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-[3px] w-full overflow-hidden ${className}`} aria-hidden="true">
      <div className="flex-1 bg-[#00853F]" />
      <div className="flex-1 bg-[#D4A017]" />
      <div className="flex-1 bg-[#E31837]" />
    </div>
  )
}

export function SenegalDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-hidden="true">
      <span className="w-[5px] h-[5px] rounded-full bg-[#00853F]" />
      <span className="w-[5px] h-[5px] rounded-full bg-[#D4A017]" />
      <span className="w-[5px] h-[5px] rounded-full bg-[#E31837]" />
    </span>
  )
}

export function SenegalStar({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-3 h-3 ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="12,2 15.09,10.26 24,10.26 17.18,15.74 19.64,24 12,18.77 4.36,24 6.82,15.74 0,10.26 8.91,10.26" />
    </svg>
  )
}
