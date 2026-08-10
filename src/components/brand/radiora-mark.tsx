// R2.8 visual convergence — a PROVISIONAL Radiora lettermark.
//
// AUDITED FIRST: the repository has no approved logo/brand asset. The only
// existing brand element is src/app/icon.tsx (the browser favicon), which
// renders the same shape this component uses — a blue rounded-square badge
// with a bold white "R" — via next/og's ImageResponse, a route-handler API
// unsuited for reuse as a sizeable, flexible in-page component.
//
// This is NOT presented as an approved corporate logo. It reuses the ONE
// visual language that already exists in the product (that favicon) rather
// than inventing an unrelated mark, sized up for the login page's hero per
// the visual-convergence brief. It deliberately lives in its own file, with
// no other consumer, so a future formal brand asset can replace this single
// component without hunting through the app for inline SVG copies.
//
// Pure presentation: no props beyond sizing/className, no data, no network.

export function RadioraMark({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center rounded-2xl bg-blue-600 font-extrabold text-white shadow-sm shadow-blue-600/20 ${className}`}
    >
      R
    </div>
  )
}
