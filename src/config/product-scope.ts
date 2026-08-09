// R2.1 — Radiora product-scope contract.
//
// ONE registry decides what the product shows. Navigation, route redirects and
// tests all read from here, so the visible surface cannot drift between them
// and there are no scattered per-component booleans.
//
// Radiora exists for exactly one workflow:
//
//   patient / examination
//     → dictation (workstation or QR-linked phone)
//     → AI clinical structuring
//     → radiologist review
//     → radiologist signature
//     → PDF / DOCX / print
//     → secure delivery
//
// Everything else is either invisible plumbing, administration, or frozen.
//
// FROZEN IS NOT DELETED. Frozen modules keep their routes, server actions,
// tables, RLS policies, migrations, audit events and history. They are simply
// removed from the normal product surface, pending a dedicated dependency and
// deletion audit. Nothing in this file removes capability.

export type FeatureScope =
  /** The one workflow. Visible, first-class. */
  | 'CORE'
  /** Required for CORE to work, but never a navigation item of its own. */
  | 'SUPPORTING_HIDDEN'
  /** Built, kept, still reachable by direct URL only if not route-guarded —
   *  but out of the normal product surface. Never deleted here. */
  | 'FROZEN'
  /** Administration. Visible only to the roles that administer a clinic. */
  | 'ADMIN_ONLY'

export interface FeatureDefinition {
  scope: FeatureScope
  /** Locale-stripped route this feature owns, when it has one. */
  route?: string
  /** Why it carries this scope — read by humans, not code. */
  note: string
}

// ─── The registry ─────────────────────────────────────────────────────────────

export const PRODUCT_SCOPE = {
  // ── CORE — the workflow ────────────────────────────────────────────────────
  new_report:        { scope: 'CORE', route: '/reports/new', note: 'Canonical entry to the reporting workflow' },
  reports:           { scope: 'CORE', route: '/reports',     note: 'Report list — the application landing page' },
  templates:         { scope: 'CORE', route: '/templates',   note: 'Report templates the radiologist writes from' },
  workstation_dictation: { scope: 'CORE', note: 'Browser microphone dictation inside the report' },
  qr_mobile_dictation:   { scope: 'CORE', note: 'Tokenised phone dictation — infrastructure stays fully functional' },
  audio_import:      { scope: 'CORE', note: 'Uploading an existing recording' },
  transcription:     { scope: 'CORE', note: 'Transcript capture and editing' },
  ai_structuring:    { scope: 'CORE', note: 'runStructuring — the canonical pipeline unified in R2.0' },
  report_editor:     { scope: 'CORE', note: 'Structured HPD editor and review' },
  signature:         { scope: 'CORE', note: 'Radiologist validation and signing' },
  export_pdf_docx_print: { scope: 'CORE', note: 'Canonical export model — PDF, DOCX, print' },
  secure_delivery:   { scope: 'CORE', note: 'Tokenised patient/physician delivery' },
  report_history:    { scope: 'CORE', note: 'Version history of a report' },

  // ── SUPPORTING_HIDDEN — plumbing, never a nav item ─────────────────────────
  authentication:    { scope: 'SUPPORTING_HIDDEN', note: 'Login, invites, session' },
  rls:               { scope: 'SUPPORTING_HIDDEN', note: 'Tenant isolation' },
  audit_events:      { scope: 'SUPPORTING_HIDDEN', note: 'Written always; the audit UI is frozen' },
  report_versions:   { scope: 'SUPPORTING_HIDDEN', note: 'Snapshots behind report history' },
  ai_configuration:  { scope: 'SUPPORTING_HIDDEN', note: 'Engine wiring — never surfaced as product copy' },
  storage:           { scope: 'SUPPORTING_HIDDEN', note: 'Private buckets for audio, branding, deliveries' },
  technical_diagnostics: { scope: 'SUPPORTING_HIDDEN', note: 'Dictation diagnostics — support tooling only' },
  institution_configuration: { scope: 'SUPPORTING_HIDDEN', note: 'Backing config for letterhead; surfaced under ADMIN_ONLY' },
  user_administration: { scope: 'SUPPORTING_HIDDEN', note: 'Backing config for users; surfaced under ADMIN_ONLY' },

  // ── FROZEN — kept, not shown ───────────────────────────────────────────────
  dashboard:         { scope: 'FROZEN', route: '/dashboard',      note: 'Replaced by Reports as the landing page' },
  patient_directory: { scope: 'FROZEN', route: '/patients',       note: 'RIS-style directory — not the radiologist workflow' },
  study_management:  { scope: 'FROZEN', route: '/studies',        note: 'RIS-style worklist — not the radiologist workflow' },
  voice_dictation_module: { scope: 'FROZEN', route: '/vacations', note: 'Standalone dictation module; QR infrastructure stays CORE' },
  secretary_desk:    { scope: 'FROZEN', route: '/secretary',      note: 'Clerical queue' },
  analytics:         { scope: 'FROZEN', route: '/analytics',      note: 'Operational analytics' },
  critical_queue:    { scope: 'FROZEN', route: '/critical-queue', note: 'Critical results workflow' },
  audit_history_ui:  { scope: 'FROZEN', route: '/audit',          note: 'Audit events keep being written; the UI is hidden' },
  feedback:          { scope: 'FROZEN', route: '/feedback',       note: 'Pilot feedback capture' },
  pilot_dashboard:   { scope: 'FROZEN', route: '/pilot',          note: 'Pilot instrumentation' },
  billing:           { scope: 'FROZEN', route: '/settings/billing', note: 'Subscription management' },
  notifications_centre: { scope: 'FROZEN', route: '/settings/notifications', note: 'Notification settings' },
  peer_review:       { scope: 'FROZEN', note: 'Schema exists; no product surface' },
  discrepancy_review:{ scope: 'FROZEN', note: 'Schema exists; no product surface' },
  external_ai_ui:    { scope: 'FROZEN', note: 'Reached from a frozen study page' },
  patient_explanations: { scope: 'FROZEN', note: 'Panel on the report page' },
  report_translations:  { scope: 'FROZEN', note: 'Panel on the report page' },
  batch_export:      { scope: 'FROZEN', note: 'Bulk ZIP export' },

  // ── ADMIN_ONLY ─────────────────────────────────────────────────────────────
  users:             { scope: 'ADMIN_ONLY', route: '/users',            note: 'Invite and manage clinic staff' },
  institution:       { scope: 'ADMIN_ONLY', route: '/settings',         note: 'Clinic identity' },
  letterhead:        { scope: 'ADMIN_ONLY', route: '/settings/headers', note: 'Report letterhead library' },
  account_administration: { scope: 'ADMIN_ONLY', route: '/admin',       note: 'Platform administration (super_admin)' },
} as const satisfies Record<string, FeatureDefinition>

export type FeatureKey = keyof typeof PRODUCT_SCOPE

export function featureScope(key: FeatureKey): FeatureScope {
  return PRODUCT_SCOPE[key].scope
}

export function featuresInScope(scope: FeatureScope): FeatureKey[] {
  return (Object.keys(PRODUCT_SCOPE) as FeatureKey[]).filter(
    (k) => PRODUCT_SCOPE[k].scope === scope,
  )
}

// ─── Route classification ─────────────────────────────────────────────────────

/** Where an authenticated user lands, and where frozen routes send them. */
export const LANDING_ROUTE = '/reports'

/**
 * Paths that must NEVER be redirected by the product-surface freeze, whatever
 * else this file says. Getting this wrong breaks patient delivery, printing or
 * the phone recorder, so it is an explicit allowlist checked first.
 */
const NEVER_REDIRECT_PREFIXES = [
  '/api/',       // PDF, DOCX, delivery download, webhooks — own auth
  '/auth/',      // logout route handler
  '/r/',         // PUBLIC secure delivery landing (patient/physician)
  '/m/',         // PUBLIC QR mobile recorder (capability token, no session)
  '/login',
  '/signup',
  '/accept-invite',
  '/deactivated',
  '/onboarding-error',
  '/_next/',
]

/** Exact public marketing/support paths that are not part of the app surface. */
const PUBLIC_EXACT = new Set(['/', '/features', '/pricing', '/security', '/contact', '/support', '/demo'])

export function isNeverRedirected(localelessPath: string): boolean {
  if (PUBLIC_EXACT.has(localelessPath)) return true
  if (localelessPath.startsWith('/support/')) return true
  if (NEVER_REDIRECT_PREFIXES.some((p) => localelessPath === p.replace(/\/$/, '') || localelessPath.startsWith(p))) {
    return true
  }
  // Report sub-routes are CORE, including the print view. Guarding this
  // explicitly keeps /reports/<id>/print out of any future freeze rule.
  if (localelessPath === LANDING_ROUTE || localelessPath.startsWith(`${LANDING_ROUTE}/`)) return true
  return false
}

// Frozen routes, longest-first so '/settings/billing' is matched before
// '/settings' (which is ADMIN_ONLY, not frozen).
const FROZEN_ROUTES: string[] = (Object.keys(PRODUCT_SCOPE) as FeatureKey[])
  .filter((k) => PRODUCT_SCOPE[k].scope === 'FROZEN')
  .map((k) => (PRODUCT_SCOPE[k] as FeatureDefinition).route)
  .filter((r): r is string => Boolean(r))
  .sort((a, b) => b.length - a.length)

/**
 * Should this authenticated app path be redirected to the landing page?
 * Never true for public, API, print, delivery or mobile-token routes.
 */
export function isFrozenRoute(localelessPath: string): boolean {
  if (isNeverRedirected(localelessPath)) return false
  return FROZEN_ROUTES.some(
    (route) => localelessPath === route || localelessPath.startsWith(`${route}/`),
  )
}

/** Frozen routes in scope order — exported for documentation and tests. */
export function frozenRoutes(): string[] {
  return [...FROZEN_ROUTES]
}
