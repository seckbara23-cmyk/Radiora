# Radiora — product scope

**Status:** frozen at R2.1. **Date:** 2026-08-09.

Radiora exists for one workflow:

```
patient / examination
  → dictation (workstation microphone or QR-linked phone)
  → AI clinical structuring
  → radiologist review
  → radiologist signature
  → PDF / DOCX / print
  → secure delivery
```

The most important capability is **voice → structured clinical report**.
Everything on this page is judged against that sentence.

The machine-readable version of this document is
[`src/config/product-scope.ts`](../../src/config/product-scope.ts). Navigation,
route redirects and the test suite all read from that registry, so the visible
surface cannot drift between them. **Change scope there, not here** — this page
explains the reasoning.

> **Frozen is not deleted.** Every frozen module keeps its routes, server
> actions, database tables, RLS policies, migrations, audit events and history.
> R2.1 removed things from the *product surface* only. Nothing lost capability
> and no data was touched.

---

## A. CORE — the workflow

Visible, first-class, actively developed.

| Feature | Where |
|---|---|
| New report | `/reports/new` — the canonical entry |
| Reports | `/reports` — the landing page |
| Templates | `/templates` |
| Workstation dictation | inside the report |
| QR / mobile dictation | `/m/[token]` + tokenised sessions |
| Audio import | inside the report / queue |
| Transcription | transcript capture and editing |
| AI structuring | `runStructuring` — unified in R2.0 |
| Editor / review | structured HPD editor |
| Signature | radiologist validation and signing |
| PDF / DOCX / print | canonical export model |
| Secure delivery | `/r/[token]` + frozen export bytes |
| Report history | version snapshots per report |

## B. SUPPORTING / HIDDEN

Required for CORE to work; never a navigation item of its own.

Authentication · RLS and tenant isolation · audit events (still written on every
clinical action) · report versions · AI/engine configuration · storage buckets ·
technical diagnostics · institution configuration · user administration.

The last two are *surfaced* under ADMIN_ONLY, but they are plumbing: a
radiologist never needs them to write a report.

## C. FROZEN — kept, not shown

Reachable in the repository and the database; removed from the normal product
surface and redirected to Reports for signed-in users.

| Module | Route | Why frozen |
|---|---|---|
| Dashboard | `/dashboard` | Replaced by Reports as the landing page |
| Patient directory | `/patients` | RIS-style directory, not the radiologist workflow |
| Study management | `/studies` | RIS-style worklist |
| Standalone voice dictation | `/vacations` | The module; the QR **infrastructure** stays CORE |
| Secretary desk | `/secretary` | Clerical queue |
| Analytics | `/analytics` | Operational reporting |
| Critical queue | `/critical-queue` | Critical-results workflow |
| Audit history UI | `/audit` | Events keep being written; only the screen is hidden |
| Feedback | `/feedback` | Pilot capture |
| Pilot dashboard | `/pilot` | Pilot instrumentation |
| Billing | `/settings/billing` | Subscription management |
| Notifications centre | `/settings/notifications` | Notification settings |
| Peer review | — | Schema only, no surface |
| Discrepancy review | — | Schema only, no surface |
| External AI UI | — | Reached from a frozen study page |
| Patient explanations | — | Panel on the report page |
| Report translations | — | Panel on the report page |
| Batch export | — | Bulk ZIP |

## D. ADMIN ONLY

Visible to `clinic_admin` and `super_admin`. **Administrative access grants no
clinical authority**: signing remains radiologist-only, enforced by
`lib/safety/authority.ts` and the database triggers from migrations 039 and 042.

| Function | Route |
|---|---|
| Users | `/users` |
| Institution | `/settings` |
| Letterhead | `/settings/headers` |
| Platform administration (`super_admin`) | `/admin` |

## E. REMOVE LATER — only after a dedicated deletion audit

Nothing in this list has been deleted. Each needs a dependency audit first,
because several are referenced by analytics, platform metrics or historical
data that is still meaningful.

- `generateStructuredDraft`, `acceptAiOutput`, `lib/ai/mock-engine.ts` — zero
  callers (confirmed in R1 and re-confirmed in R2.0).
- `ai_suggestions` table — zero references in `src/`.
- `reports.ai_draft` column — selected by the mapper, written by nobody.
- `report_status = 'in_review'` — in the enum and the filters, never written.
- `voice_transcripts` write path — duplicated by `transcriptions`;
  `applyVoiceTranscript` only writes an audit row. Analytics still counts these
  rows, so the table cannot simply be dropped.
- `src/lib/mock-data.ts` and `/admin/users` — a live page rendering fake users.
- The duplicate `(dashboard)/_components/Sidebar.tsx`.

---

## Navigation

A normal radiologist sees exactly three clinical items:

```
[ + New Report ]   ← primary action
  Reports          ← landing page
  Templates
```

Administrators additionally see an **Administration** group (Users,
Institution, Letterhead), and `super_admin` a **Platform** group.

## Redirect policy

Signed-in users hitting a frozen route are redirected to `/[locale]/reports`,
preserving locale. The decision is made once, by `isFrozenRoute()`.

**Never redirected**, whatever else the registry says:

- `/api/*` — PDF, DOCX, delivery download, webhooks (own auth)
- `/auth/*` — logout handler
- `/r/*` — public secure delivery (patients and referring physicians)
- `/m/*` — QR mobile recorder (capability token, no session)
- `/reports/*` — including `/reports/[id]/print`
- `/login`, `/signup`, `/accept-invite`, `/deactivated`, `/onboarding-error`
- public marketing and support pages, `_next` assets

No redirect loop is possible: the target (`/reports`) is CORE and explicitly
excluded from the frozen set, and a test asserts it.

## Status vocabulary

Internal state names never reach the screen or the URL:

| Shown | Internal |
|---|---|
| Brouillon / Draft | `draft` |
| À relire / Review required | `in_review`, `amended` |
| Signé / Signed | `finalized` |
| Envoyé / Delivered | `finalized` + an active delivery |

An amended report reads as **Review required**, not Signed — amending clears
`signed_at` in the database, so claiming a signature would be misleading.

Product copy also avoids "Local Engine", "Classic Recording", "Vacation Queue",
AI provider names and workflow-state names.
