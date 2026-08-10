// R2.8 — abstract, radiology-inspired visual language for the public surface.
//
// Deliberately NOT a photograph. A licensed/de-identified scan still carries
// legal and clinical risk (What modality? Whose consent? Does it read as a
// diagnosis?) that a purely geometric abstraction has no way to accidentally
// trigger. This borrows the VOCABULARY of imaging — a gantry ring, an axial
// slice, a crosshair reticle — as line art, in the product's own blue, never
// pretending to be an actual study. Inline SVG: no request, no next/image
// config, no external host, sub-kilobyte either way.
//
// Every element is aria-hidden — this is decoration, and a screen reader
// describing "a stylised scan disc" to a radiologist would be pure noise.

export function RadiologyScanMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="100" cy="100" r="92" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="70" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="48" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      {/* Gantry tick marks, every 30°. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180
        const inner = 92
        const outer = 100
        return (
          <line
            key={i}
            x1={100 + inner * Math.cos(a)}
            y1={100 + inner * Math.sin(a)}
            x2={100 + outer * Math.cos(a)}
            y2={100 + outer * Math.sin(a)}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1.5"
          />
        )
      })}
      {/* Crosshair reticle — the "point of focus" a report is written about. */}
      <line x1="100" y1="30" x2="100" y2="170" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      <line x1="30" y1="100" x2="170" y2="100" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      <circle cx="100" cy="100" r="4" fill="currentColor" fillOpacity="0.5" />
      {/* A single highlighted arc — implies an acquisition sweep, not a finding. */}
      <path
        d="M 100 8 A 92 92 0 0 1 176 52"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A row of thin horizontal bars — reads as an axial slice stack, used small. */
export function RadiologySliceStack({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 32" className={className} fill="none" aria-hidden="true" focusable="false">
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={i}
          x="0"
          y={i * 6}
          width={i === 2 ? 120 : 96}
          height="3"
          rx="1.5"
          fill="currentColor"
          fillOpacity={i === 2 ? 0.9 : 0.18 + i * 0.04}
        />
      ))}
    </svg>
  )
}
