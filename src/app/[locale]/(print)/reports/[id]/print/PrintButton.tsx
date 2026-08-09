'use client'

// R0.4 — the print trigger.
//
// This replaces an `onClick={() => {}}` that had been left on a button inside an
// async Server Component: React cannot serialize an event handler across the
// server/client boundary, so every request to the print route threw
// "Event handlers cannot be passed to Client Component props" and the page 500'd.
// A one-line client island is the smallest correct fix, and it drops the inline
// dangerouslySetInnerHTML script the page previously relied on.

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        display: 'block',
        margin: '0 auto 24px',
        padding: '10px 28px',
        background: '#1d4ed8',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: 'sans-serif',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
