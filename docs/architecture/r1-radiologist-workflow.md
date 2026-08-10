# R1 — Radiologist workflow: architecture freeze

**Status:** frozen for R2. **Date:** 2026-08-09. **Application SHA at audit:** `9cbba6e`.

> **Implementation status — R2.0, R2.1 and R2.2 COMPLETE.** See the status
> appendices at the end of this document
> ([R2.0](#r20-implementation-status) · [R2.1](#r21-implementation-status) ·
> [R2.2](#r22-implementation-status)). The body below is the original audit and
> remains the frozen architecture; only the status appendices are added.

This document is the product-surface and architecture freeze that R2 implements
against. It is the result of a full read-only audit of the repository — every
claim below carries a `file:line` citation and was read from source, not
inferred. Where the audit found the code disagrees with the intended design, the
document says so plainly rather than describing the intention.

**The question R1 exists to answer:**

> Can we implement the unified dictation → structuring → signature → delivery
> workflow next, without creating a second report architecture or weakening the
> clinical safety controls already deployed?

**Answer: yes, with two schema extensions and one convergence.** The reasoning is
in §1 and §14; the short version is that the export side already has exactly one
canonical content model and every output flows through it, while the *input*
side has three unshared dictation surfaces and a transcript that cannot bind to
a report. R2 unifies the input side onto the model that already exists.

---

## 1. Current architecture map

### 1.1 The one thing that is already right

Every report output derives from a single canonical model. Verified by
repo-wide grep: `buildReportExportModel` has exactly **one** production call
site, and all five outputs enter through `assembleReportExport`.

```
reports row
  → getReport(id)                        src/lib/data/reports.ts:40   (session client → RLS)
  → assembleReportExport(id, headerChoice)  src/lib/export/load.ts:80
      → buildReportExportModel(...)         src/lib/export/model.ts:163  (pure, no IO, no clock)
          → ReportExportModel
              ├→ renderReportPdf(model, images)    src/lib/export/pdf.ts:184
              ├→ renderReportDocx(model, images)   src/lib/export/docx.ts:185
              ├→ print JSX over model              (print)/reports/[id]/print/page.tsx:33
              └→ createDelivery → both renderers → frozen bytes  actions/deliveries.ts:85-91
```

| Output | Entry | Content source |
|---|---|---|
| PDF | `api/reports/[id]/pdf/route.ts:20,23` | `assembleReportExport` → `renderReportPdf` |
| DOCX | `api/reports/[id]/docx/route.ts:21,24` | `assembleReportExport` → `renderReportDocx` |
| Batch ZIP | `api/vacations/export/route.ts:31,33` | `assembleReportExport` → `renderReportPdf` |
| Print | `(print)/reports/[id]/print/page.tsx:33` | `assembleReportExport` → JSX |
| Secure delivery | `actions/deliveries.ts:85,89,90` | `assembleReportExport` → both → frozen bytes |
| Patient download | `api/delivery/[token]/file/route.ts:63` | frozen bytes only, never re-rendered |

Section labels, section order, the legacy fallback, the draft/watermark rule and
the filename all exist in exactly one place (`model.ts:236-258`, `:167-169`,
`:277-285`). Neither renderer imports the data layer or `@/types/report`.

**This is the asset R2 must not fork.** Anything the live workspace produces has
to end at `StructuredReportData` on the `reports` row.

### 1.2 The input side is fragmented

The report page composes six numbered `WorkspaceSection` blocks
(`reports/[id]/page.tsx:36-53`, whose own comment says *"Presentational only"*),
and inside the first one `ReportEditor` stacks **three independent collapsible
dictation accordions**, each with its own open state, its own colour, and — for
two of them — its own microphone:

| Surface | File | Writes to the report? | Pipeline |
|---|---|---|---|
| "Classic recording" | `reports/[id]/VoiceDictationPanel.tsx` (627 lines) | **No** — writes `voice_transcripts`, then hands a string to the panel below | own inline Web Speech |
| "Live dictation" | `components/dictation/LiveDictationPanel.tsx` (404) | **No** — on the report page it persists nothing at all | `computeLivePreview` → `runStructuring` (full) |
| "AI Structuring" | `reports/[id]/SmartStructuringPanel.tsx` (250) | **Yes** — the only DB writer | `parseStructuredText` **only** |

Their sole connection is a one-way in-memory string:

```
VoiceDictationPanel ─┐
                     ├─► onApply(text) ─► voiceSignal ─► SmartStructuringPanel.freeText
LiveDictationPanel  ─┘                                          │
                                                 generateHPDDraft → ai_jobs/ai_outputs
                                                                │
                                                 acceptHPDDraft → UPDATE reports  ◄── ONLY write
```

Shared code between the three is **`findMedicalCorrections` and nothing else**.
There are two independent Web Speech implementations with different `onend`
semantics (`VoiceDictationPanel.tsx:107-159` vs `lib/hooks/use-speech-recognition.ts`),
and three persistence models.

### 1.3 The consequential asymmetry

`generateHPDDraft` (`actions/ai.ts:162`) calls `parseStructuredText` **directly**,
bypassing `runStructuring`. So on the report page dictation gets:

- no self-correction (`detectSelfCorrections`),
- no French cleanup (`cleanupFrench`, including the uncertainty fail-safe),
- no confidence scoring, hence no `reviewRequired`.

The vacation-queue path (`actions/structuring.ts:81`) and live dictation
(`live-dictation.ts:144`) both get the full pipeline. **Three entry points, two
different pipelines — and the weaker one is the radiologist's.**

### 1.4 Subsystem verdicts

| Subsystem | Location | Verdict |
|---|---|---|
| `runStructuring` | `lib/ai/structuring-engine.ts:95` | **REUSE** |
| HPD parser | `lib/ai/hpd-engine.ts` | **REUSE** (3 defects, §8.3) |
| `detectSelfCorrections` | `lib/ai/self-correction.ts` | **REUSE** (unsafe on partials, §8.2) |
| `cleanupFrench` / `uncertainty` | `lib/ai/french-cleanup.ts`, `uncertainty.ts` | **REUSE** |
| `voice-corrections`, `dictation-segments` | `lib/ai/` | **REUSE** |
| `computeLivePreview` | `lib/ai/live-dictation.ts:141` | **REUSE** behind a stability boundary |
| `use-speech-recognition` | `lib/hooks/` | **REUSE** — the better of the two STT bindings |
| Export model + renderers + print + delivery | `lib/export/*`, `actions/deliveries.ts` | **REUSE** |
| `StructuredEditor`/`DocSection`/`AutoTextarea`/`SpecialFormTableEditor` | `ReportEditor.tsx:47-340` | **REUSE** — this is the document |
| `saveDraftReport`/`finalizeReport`/`amendReport`/`acceptHPDDraft` | `actions/reports.ts`, `ai.ts` | **REUSE** — the only correctly gated writers |
| `versioning.ts`, `immutability.ts`, `workflow-authority.ts`, `authority.ts` | `lib/reports/`, `lib/safety/` | **REUSE** — R0 chokepoints, untouchable |
| QR/mobile token, TTL, upload, `MobileRecorder` | `actions/dictation.ts`, `m/[token]/` | **REUSE UNDERNEATH NEW SHELL** — needs §6 schema change |
| `LiveDictationPanel` component | `components/dictation/` | **REUSE UNDERNEATH NEW SHELL** — keep logic, replace chrome |
| `ReportEditor` orchestrator, single `<form>` | `ReportEditor.tsx:546-787` | **REUSE UNDERNEATH NEW SHELL** |
| `WorkspaceSection` numbering | `reports/[id]/page.tsx` | **DEPRECATE LATER** |
| `VoiceDictationPanel` | `reports/[id]/` | **DEPRECATE LATER** — lift vocabulary learning + F14 segments first |
| `SmartStructuringPanel` UI | `reports/[id]/` | **DEPRECATE LATER** — keep its server actions |
| `generateStructuredDraft`, `acceptAiOutput`, `mock-engine.ts` | `actions/ai.ts:34,196` | **REMOVE LATER** — zero callers |
| `ai_suggestions` table, `reports.ai_draft`, `report_status='in_review'` | migrations 004, 001 | **REMOVE LATER** — never written |

---

## 2. Target radiologist journey

```
LOGIN
  ↓
SELECT PATIENT / EXAM              ← existing patients/studies; §7
  ↓
ONE WORKSPACE
  ├ template / exam type           ← §4
  ├ dictation source: computer | phone (QR)   ← §5, §6
  ↓
DICTATE  →  transcript grows       ← §7 lifecycle
  ↓
AI STRUCTURES (sections populate)  ← §8, behind a stability boundary
  ↓
RADIOLOGIST REVIEWS / CORRECTS     ← §9, edits lock sections
  ↓
RADIOLOGIST SIGNS                  ← unchanged R0.8 authority
  ↓
PDF / DOCX / PRINT / SECURE DELIVERY  ← §11, unchanged canonical path
```

The doctor never chooses between "classic recording", "live dictation" and "AI
structuring". Those become implementation details behind one **Start dictation**
control with a source selector.

**Target surface** (R1 freezes this shape; R2 builds it):

```
┌─ Patient / Exam ─────────────────────────────────┐
│ DIOP Mamadou · 56 ans · Scanner cérébral         │
│ Template: [ Scanner cérébral ▼ ]                 │
│ Source:   [ Computer ] [ Phone / QR ]            │
│                    🎙  START DICTATION           │
└──────────────────────────────────────────────────┘
┌─ REPORT ─────────────────────────────────────────┐
│ INDICATION      [ populates progressively ]      │
│ TECHNIQUE       [ … ] ⚠ confirm protocol         │
│ RÉSULTATS       [ … ]                            │
│ CONCLUSION      [ … ]                            │
└──────────────────────────────────────────────────┘
        [ Save draft ]   [ Validate & sign ]
```

---

## 3. Canonical report model

**`StructuredReportData` (`src/types/report.ts:29-42`) is and remains the single
clinical content model.** R2 adds no competing shape.

```ts
interface StructuredReportData {
  language: 'fr' | 'en'
  examType: string            // snake_case, e.g. scanner_cerebral
  examTitle: string           // "SCANNER CÉRÉBRAL"
  patient: { name, age, sex, serviceOrWard? }
  indication, technique, results, conclusion: string
  recommendations?: string
  specialForm?: { layout, values: Record<string,string> }   // F18 measurement table
  dictationTranscript?: string
  generatedAt?: string
}
```

Section keys are `SectionKey` (`lib/safety/sections.ts:9`) with `SECTION_ORDER`
and `SECTION_LABELS` alongside. Persisted on `reports.structured_data` (jsonb,
migration 013).

**Known duplication to converge, not extend:**

- `reports.findings` / `impression` are a legacy mirror of `results` /
  `conclusion`, dual-written in four places (`ReportEditor.tsx:447-455`,
  `ai.ts:311-321`, `structuring.ts:206-216`, `reports.ts:151-155`) and **broken
  in a fifth** (`external-ai.ts:411`, §12.3). Readers already prefer
  `structured_data` (`model.ts:165`). Keep the mirror for now; it is what the
  legacy branch of the signing gate reads.
- `SECTION_ORDER` was exported but never imported — `model.ts:238-259`
  hard-codes the same order. The new patch contract (§8.4) is its first
  consumer; R2 should make `model.ts` read it too.
- `transcriptions.structured_json` is a **second persisted copy** of
  `StructuredReportData`, synced to the report only by `acceptStructuredReport`
  with no invariant between them.

---

## 4. Template architecture

The brief's three-way split (clinical / presentation / instance) maps onto the
repository as follows. **Only one of the three exists properly today.**

### A. Clinical template — **DOES NOT EXIST**

There is no layer describing *which sections an exam has, in what order, free
text or table*. That knowledge is smeared across five places: `model.ts` (export
order), `ReportEditor.tsx` (editor order), `config/special-forms.ts` (the only
real structure model, 3 exams), `import-parser.ts` (4 fixed sections), and five
fixed columns on `report_templates`.

What exists instead:

- **`report_templates`** (004 + 014 + 024) — a flat record of five free-text
  strings: `indication_template`, `technique_template`, `findings_template`,
  `impression_template`, `recommendations_template`, plus `exam_type` (soft
  link, no FK) and `source`. Adding a sixth section is a migration. **No DELETE
  policy exists** — templates can only be deactivated.
- **`exam_catalog`** (023) — 85 seeded exams with `modality`, `title`,
  `exam_type`, `default_technique`, `special_layout`, `normal_template_id`.
  Correctly shaped. **Its only consumer is the settings page.**
- **`config/special-forms.ts`** — `SpecialFormSchema` with ordered rows,
  columns, units, references and `required` flags. **This is the only genuine
  structured-content model in the codebase and is the right generalisation
  target for a clinical template.**

Dead links found (all grep-verified):

| Item | Status |
|---|---|
| `exam_catalog.normal_template_id` | never written, never read |
| `exam_catalog.special_layout` → editor | read only for a settings badge; layout is chosen manually |
| `report_templates.exam_type` | written by the importer, never read by any query |
| `indication_template`, `technique_template` | written by importer/starter/form, **never applied to a report** |
| `specialLayoutForExamType()` | zero call sites |
| `is_personal` / `personal_author_id` | never written; the RLS update promised in 014 was never made |

**Template application today** (`ReportEditor.tsx:521-543`) is 20 lines,
client-side, full-overwrite, and applies only results/conclusion/recommendations
— it silently ignores the indication and technique columns. Reports have no
`template_id`, so nothing records which template a report came from.

**Duplicated exam knowledge:** `hpd-engine.ts:211-236` (`buildExamInfo`,
`buildDefaultTechnique`) carries its own `MODALITY_BODY_MAP` + `FR_TECHNIQUES`
that **contradicts** `config/exam-catalog.ts` — different technique wording, and
it emits slugs like `examen_ct` that exist in no catalog. The editor uses
hpd-engine's version. Default technique text exists in **four** places.
Modality vocabulary exists in **three** (`TemplateForm.tsx:8` has 9 values,
`types/exam.ts:13` and the DB CHECK have 5).

Also: 11 of the 21 starter templates carry an `exam_type` that resolves to
nothing in the catalog.

### B. Presentation template — **EXISTS AND IS CLEAN. REUSE.**

`hospital_headers` (025) + `ExportHeaderChoice` + `ReportExportModel`. Three
modes resolved per export (`model.ts:177-208`): no header ("classic"), a library
header, or the clinic default. Logo from the private `clinic-branding` bucket;
signature identity from `lib/profile/signature.ts`.

What is **not** separated: typography and layout are hard-coded PDF constants
(`pdf.ts:19-28`), and section order/labels are fixed in `model.ts`. A per-clinic
"presentation profile" does not exist. That is acceptable for R2.

### C. Report instance — **EXISTS.** `reports.structured_data` owns its own
content; applying a template copies text in. Editing a report cannot mutate a
template (no write path exists). This invariant holds today and must be kept.

### R2 direction

Introduce a **clinical template** as a resolved, versioned value object —
ordered sections with kind (`free_text` | `table`) and `required` — derived from
`exam_catalog` + `special-forms.ts`, not a new free-form table. Make
`hpd-engine`'s exam/technique tables read from the catalog rather than their own
copies. Do not extend `report_templates`' five-column shape.

---

## 5. Voice input architecture

Both existing sources are preserved.

**A. Computer microphone.** `use-speech-recognition.ts` is the binding to keep:
pause/resume, auto-restart on silence, `injectText` for sample dictations,
elapsed timer, `supported` probe. `VoiceDictationPanel`'s duplicate
implementation dies on silence and should be retired once its unique assets are
lifted (vocabulary learning via `recordVocabularyLearning`, F14 multi-patient
segmentation, and the `voice_transcripts` review/reject audit trail).

**B. Phone via QR.** See §6.

**No audio is recorded on the report page today.** `VoiceDictationPanel` stores
text only (`actions/voice.ts:22`); `LiveDictationPanel` stores nothing. The
`audio_assets` + `dictation-audio` machinery exists one table over and is
vacation-shaped. This is a medico-legal gap R2 should close.

---

## 6. QR / mobile reuse plan

The security model is sound and must be reused, not rebuilt:

- 192-bit capability token, `randomBytes(24)` (`actions/dictation.ts:74`).
- 30-minute TTL (`types/dictation.ts:12`), enforced on upload
  (`dictation.ts:208-211`, which flips the session to `expired`).
- The phone never authenticates. `uploadFromMobile` runs server-side with the
  service-role client and validates the token in code; the key never leaves the
  server.
- The phone page is `robots: noindex` and receives **low-PHI only** —
  `patient_label` (the pre-match fallback, never the matched patient's real
  name), exam number, modality (`lib/data/dictation.ts:13-64`).
- QR is rendered server-side by the `qrcode` package — no external service.
- Desktop learns of completion by polling `getDictationSessionStatus` every
  2.5 s (`ConnectMobileDictation.tsx:47-63`).

**The blocker:** `dictation_sessions.vacation_item_id` is **NOT NULL** with no
`report_id` column (migration `019:35`), and `uploadFromMobile` hard-codes the
queue item as its write target (`dictation.ts:223,262-279`). `audio_assets` has
no `report_id` either. So QR dictation cannot currently be started from a report.

**R2 change (migration 044+, additive):** add nullable `report_id` to
`dictation_sessions` and `audio_assets`, relax `vacation_item_id` to nullable,
and require exactly one of the two owners via a CHECK. Branch `createDictationSession`
and `uploadFromMobile` on which owner is set. Do **not** create a second mobile
recorder — `MobileRecorder.tsx` is good and stays.

A report that originated from the queue can already resolve its item id
server-side (`lib/data/safety.ts:27-33` does exactly this lookup), so the
queue-linked case works before the migration lands.

---

## 7. Transcript lifecycle

**Two independent transcript models exist today. Do not add a third.**

| | `transcriptions` (018+020) | `voice_transcripts` (009) |
|---|---|---|
| Anchor | `vacation_item_id` **NOT NULL, UNIQUE** | `report_id` **nullable** |
| Layers | raw → corrected → cleaned → `structured_json`, + `correction_events`, `confidence` | single flat `transcript_text` |
| Audio | `audio_asset_id` | none |
| Reaches the report? | via `acceptStructuredReport` | **never** — `applyVoiceTranscript` writes an audit row and returns |
| Secretary RLS | included | excluded |

**A transcript cannot bind to a report.** The only route is a three-hop reverse
lookup, `getReportSafetyContext` (`lib/data/safety.ts:23-55`):
`report → vacation_items.report_id → transcriptions.vacation_item_id`.

Consequences, all load-bearing:

1. **A report created from `/studies/[id]` has no transcript, ever.**
   `getReportSafetyContext` returns null → `finalizeReport` runs the signing
   gate with `aiConfidence: null` (`reports.ts:222`) → the AI-review blocker
   **can never fire on the direct path**. The confidence subsystem is silently
   inert for exactly the workflow R2 is building.
2. The lookup uses `.maybeSingle()` on `vacation_items WHERE report_id`, but
   there is **no unique index** on that column.
3. The whole function is `try/catch → null`, so a real failure is
   indistinguishable from "no dictation".

**R2 direction:** add nullable `transcriptions.report_id` (migration 044+) so a
transcript can bind directly, keep `getReportSafetyContext` as the single
sanctioned accessor, and add the missing unique index. Retire the
`voice_transcripts` write path once its analytics consumers are moved.

**Lifecycle contract:** the transcript is **provenance and append-only**.
Structuring reads it and never rewrites it. Correcting a section never edits
the transcript — the original words stay recorded (§9).

---

## 8. Incremental structuring contract

### 8.1 The engine is pure — and non-monotonic

`runStructuring` (`structuring-engine.ts:95`) is synchronous with no IO, no
network and no DOM. Grep over `lib/ai/*.ts` for IO/clock/random returns exactly
one hit: `hpd-engine.ts:319 generatedAt: new Date().toISOString()`.

But it is a function of a **complete** transcript. Fed growing prefixes it is
non-monotonic — text already shown can move, mutate or vanish. The audit
executed the real engine on prefixes and proved seven failure modes:

1. **Mid-retraction the report goes empty.** `"Pas d'épanchement pleural."` →
   populated; `"… Non."` → **`""` with zero correction events**; `"… Non. Fine
   lame gauche."` → correct again. The blank tick emits no signal explaining why
   content disappeared.
2. **Inline markers print as clinical text** until their replacement arrives:
   `"Nodule de 12 mm ou plutôt"` renders verbatim.
3. **The 70/30 fallback re-partitions every tick** — sentences migrate between
   RÉSULTATS and CONCLUSION as the sentence count grows.
4. **`cleanupFrench:102` appends a terminal `.`**, fabricating sentence
   boundaries out of partial clauses and feeding (3).
5. **Header detection is all-or-nothing at the colon** — the document
   re-partitions in one step when `:` arrives.
6. **Confidence is length-thresholded**, so a per-tick review badge flickers and
   is meaningless.
7. **`generatedAt` changes every call**, defeating memoisation and `===` diffing.

**Conclusion: incremental structuring is safe only behind a stability
boundary.** That is not a defect to fix in R1; it is the constraint the contract
encodes.

### 8.2 The stability boundary

`splitStableTranscript(transcript)` (`lib/reports/structured-patch.ts`) splits a
growing transcript into the completed-sentence prefix that is safe to structure
and the tail that is not. It never splits a decimal (`3.5 cm`), and it holds
back a dangling retraction so the engine never observes a `"Non."` without its
replacement — which is failure mode (1), removed without touching the engine.

### 8.3 Engine defects recorded (fix in R2, not R1)

- `HEADER_HINTS` (`structuring-engine.ts:37-43`) is a hand-maintained duplicate
  of `SECTION_KEYWORDS` (`hpd-engine.ts:18-44`) and **disagrees with it** —
  e.g. `"Renseignements cliniques :"` parses but scores as inferred.
- The 70/30 fallback splits the **full text including headers**, so a report
  dictated with INDICATION/TECHNIQUE headers but no RÉSULTATS header prints its
  own headers inside RÉSULTATS.
- `matchSectionKey` sorts the module-level `SECTION_KEYWORDS` arrays **in
  place** on every call.
- `parseStructuredText` injects the default TECHNIQUE **without** the
  `autoFilled` flag, so the report path's boilerplate is unflagged.

### 8.4 The contract (implemented in R1)

`src/types/live-structuring.ts` + `src/lib/reports/structured-patch.ts`, pure and
unit-tested (16 tests). It reuses `SectionKey`, `Confidence`, `CorrectionEvent`
and projects into `StructuredReportData` — no new report shape.

```ts
LiveReportState { transcript, sections: Record<SectionKey, SectionState>, log }
SectionState    { text, origin: 'template'|'dictation'|'radiologist', locked,
                  confidence?, reviewRequired?, sourceRange? }
StructuredReportPatch { transcript, sections: SectionPatch[], corrections? }

applyStructuredPatch(state, patch) → { state, entries, suggestions, transcriptRegressed }
toStructuredReportData(state, base) → StructuredReportData     // ← the canonical model
fromStructuredReportData(sd) → LiveReportState                 // ← re-opening a report
markSectionEdited / unlockSection
splitStableTranscript(transcript) → { stable, tail }
```

Enforced rules:

1. The transcript only grows; a regression is **flagged**, not swallowed.
2. A patch never blanks a section that already has content (failure mode 1).
3. A patch never overwrites a radiologist-authored section — it becomes a
   **suggestion**.
4. `origin: 'template'` always carries `reviewRequired` — the only
   machine-authored text in the pipeline.
5. Every decision is logged with before/after text.

Provider-neutral: nothing names a model, vendor or transport.

---

## 9. Correction and provenance model

Two correction layers, kept distinct:

**Transcript-level** — `detectSelfCorrections` (`lib/ai/self-correction.ts`),
post-R0.3 preservation-first. Handles `"Je corrige"`, `"ou plutôt"`,
`"remplacez par"`, standalone `"Non."`. It **never** deletes a multi-finding or
long clause, never treats `"Non."` after a question as a retraction, and
localises `"ou plutôt"` only to a measurement, a single word, or a
morphological variant. When it cannot localise safely it **preserves the text
verbatim** and emits `CorrectionEvent { applied: false }`, which forces
`reviewRequired` upstream.

**Section-level** — `SectionPatch { kind: 'correction' }` in the new contract.
`PatchLogEntry` records `previousText` and `nextText`, so a correction is always
traceable to what it replaced.

**Invariants:** AI never silently rewrites history. The transcript is never
edited by a correction. A radiologist edit locks the section and clears any
inherited machine review flag. The doctor is the final authority.

---

## 10. Report persistence lifecycle

```
draft ──save──> draft            saveDraftReport   (role + billing + immutability gate)
draft ──sign──> finalized        finalizeReport    (RADIOLOGIST ONLY + signing gate)
finalized ──amend──> amended     amendReport       (snapshot MUST succeed or abort)
amended ──sign──> finalized
```

Every write is snapshotted through `createReportVersion`
(`lib/reports/versioning.ts:114`), which checks the Supabase error explicitly,
retries a version-number race once, and degrades gracefully if migration 039
columns are absent. `report_versions` now carries `structured_data` and the
**original** `signed_at`.

DB-enforced (migration 039): only a radiologist may enter `finalized`;
`signed_at` is server-set; while finalized, content, linkage and `signed_at` are
frozen; the only exit is `amended`, and that transition may not carry content
changes.

**Three independent status machines exist** — `reports.status`,
`vacation_items.workflow_status`, `studies.status` — with no coupling between
the first two. A radiologist can sign the legal document while the queue item
still reads `secretary_review`. R2 should derive queue state from report state
rather than adding a fourth machine or a new column.

---

## 11. Export lifecycle

Unchanged from §1.1. Draft behaviour stays: `isDraft = !(status==='finalized' ||
signedAt)`, `watermark = 'BROUILLON'`, and the print page additionally suppresses
the signature block on drafts. Delivery is the only export path with a role gate
**and** a status gate (finalized/signed only), and it freezes bytes so a patient
download never re-renders.

**Note for R2:** the PDF/DOCX/batch routes have authentication and RLS but **no
role or status gate** — any authenticated clinic member can export a watermarked
draft. That is a deliberate decision to revisit, not a regression.

---

## 12. Authority and security boundaries

**Unchanged from R0.8. R2 must not touch these.**

| Role | Clinical validation / signing | Notes |
|---|---|---|
| `radiologist` | **YES — exclusively** | `canSignReports` = `role === 'radiologist'` |
| `clinic_admin` | no | administrative only |
| `super_admin` | no | platform only; no clinical override |
| `secretary` | no | clerical; may distribute already-signed content |
| `technician`, `viewer`, `referring_physician` | no | |

Enforced at three layers: `lib/safety/authority.ts` (pure),
`lib/safety/workflow-authority.ts` + `lib/safety/immutability.ts` (action layer),
and DB triggers `enforce_report_immutability` (039) and
`enforce_vacation_validation_authority` (042). Unresolved roles fail **closed**;
`is_service_context()` is the only bypass and is unreachable from any
`authenticated`/`anon` request.

**Three gaps recorded for R2 (not fixed in R1):**

1. **`applyAcceptedFindingsToReport`** (`actions/external-ai.ts:328-426`) is a
   fourth report-content writer that bypasses `evaluateReportWrite` and
   `createReportVersion`, hand-rolls its own snapshot **omitting `clinic_id`**
   (so the RLS insert is rejected and the error is never checked), and writes
   **only `findings`** — meaning on a structured report the appended text is
   invisible in every export while silently diverging the legacy column.
2. `amendReport` allows `clinic_admin` to re-open a signed report, which is
   broader than signing authority. Mitigated: the DB trigger clears `signed_at`,
   so exports revert to BROUILLON.
3. `uploadAudio`, `routeToRadiologist` and `dictation.ts` write
   `workflow_status` with raw `.update()`, bypassing `evaluateQueueTransition`.
   All target non-clinical states and the DB trigger backstops the clinical
   ones, but they are open channels.

---

## 13. Privacy and storage rules

**Binding for R2:**

- No real patient data, no real reports, no clinical source documents in the
  repository. Nothing clinical in `public/`.
- Future template/report source files (PDF/DOCX) go to a **private Supabase
  Storage bucket**, proposed `clinical-template-sources`, clinic-scoped by path
  `<clinic_id>/…` with RLS on `storage.objects` matching the existing
  `dictation-audio` / `clinic-branding` / `report-deliveries` pattern. Metadata
  in the database; **never public, never a static URL**.
- **The AI must not depend on a PDF/DOCX at runtime.** Ingestion is:

  ```
  PDF/DOCX source → private ingestion → extract structure/layout
    → HUMAN REVIEW → normalised clinical template + presentation template
    → versioned definition → runtime contract
  ```

  The normalised template, not the original file, is what the engine sees.
- **No ingestion of any real report in R1.** None was performed.
- Never log clinical bodies, raw audio, passwords, tokens or delivery secrets.
- Tenant isolation stays with RLS; service-role is only for the documented
  capability-token and platform paths.
- Note: `starter-templates.ts` is generated from real DOCX sources under
  `reference/source/`. Those inputs must remain out of the repository and out of
  `public/`.

---

## 14. R2 implementation plan

Phased gates, adapted to what the audit found. Each is independently shippable
and validated (`npm test`, `tsc`, `lint` vs baseline, `next build`).

| Gate | Scope | Depends on |
|---|---|---|
| **R2.0** | **Converge the report dictation pipeline**: route `generateHPDDraft` through `runStructuring` instead of bare `parseStructuredText`, so the radiologist's own surface gets self-correction, cleanup and confidence. Highest value, smallest diff, no schema change. | — |
| **R2.1** | **Unified dictation workspace shell** — one *Start dictation* control with a source selector, replacing the three accordions. Existing panels render underneath, unchanged. | R2.0 |
| **R2.2** | **Canonical structured state** wired to `LiveReportState` (this document's contract) + `markSectionEdited` on every section editor. | R2.1 |
| **R2.3** | **Browser transcription adapter** on `use-speech-recognition`; retire `VoiceDictationPanel`'s duplicate STT after lifting vocabulary learning and F14 segmentation. | R2.2 |
| **R2.4** | **Incremental structuring adapter** — feed only `splitStableTranscript().stable` to `runStructuring`, diff into a `StructuredReportPatch`. Fix the four engine defects in §8.3. | R2.3 |
| **R2.5** | **Live section population** using `applyStructuredPatch`, with suggestions surfaced for locked sections. | R2.4 |
| **R2.6** | **Correction and provenance UI** — show `PatchLogEntry` history and `CorrectionEvent{applied:false}` review prompts. | R2.5 |
| **R2.7** | **QR/mobile integration** — migration 044: nullable `report_id` on `dictation_sessions` + `audio_assets`, nullable `vacation_item_id`, CHECK exactly-one-owner; branch create/upload. Reuse `MobileRecorder` as-is. | R2.1 |
| **R2.8** | **Transcript binding** — migration 045: nullable `transcriptions.report_id`, unique index on `vacation_items.report_id`; make the signing gate's confidence work on the direct path. | R2.7 |
| **R2.9** | **Clinical template foundation** — resolve an ordered section definition from `exam_catalog` + `special-forms.ts`; make `hpd-engine` read the catalog instead of its own tables; apply `indication_template`/`technique_template`. | R2.2 |
| **R2.10** | **Export parity** — assert live workspace output renders identically through `buildReportExportModel`; make `model.ts` consume `SECTION_ORDER`. | R2.5, R2.9 |
| **R2.11** | **Pilot UAT** with Dr BA on real exams. | all |

Cleanups to fold in opportunistically: fix `external-ai.ts` (§12.1) — it is a
live correctness bug; remove the dead paths in §1.4; converge the two report
creation paths (billing gate missing on the queue path, idempotency missing on
the direct path, `author_id` assignable by a secretary).

---

## 15. Explicit non-goals

R1 did **not**, and R2's early gates must not:

- Implement a streaming AI pipeline, or any external/hosted model. The engine
  stays local and deterministic.
- Replace `StructuredReportData` or add a second report content model.
- Change any export, PDF, DOCX, print or delivery behaviour.
- Modify migrations 038–043 or weaken any R0 control: finalized-report
  immutability, profile privilege guard, delivery grant/lockout/expiry,
  radiologist-only validation, queue predecessor guards.
- Introduce an administrative clinical override.
- Delete `VoiceDictationPanel`, `SmartStructuringPanel` or the vacation queue.
  They stay until their replacements are proven.
- Ingest, commit or expose any real report or patient document.
- Redesign the dashboard, sidebar or navigation.
- Add a fourth status machine or a `reports.transcript_text` column.

---

## Appendix — R1 deliverables

| File | Purpose |
|---|---|
| `docs/architecture/r1-radiologist-workflow.md` | This freeze document |
| `src/types/live-structuring.ts` | Incremental structuring contract (types) |
| `src/lib/reports/structured-patch.ts` | Pure state, patch application, stability boundary |
| `src/lib/reports/structured-patch.test.ts` | 16 tests pinning the safety rules |

No schema change, no migration, no behavioural change to any deployed path.

---

## R2.0 implementation status

**Gate R2.0 — unify the radiologist structuring pipeline. COMPLETE.**

### What changed

The radiologist-facing path now runs the **canonical pipeline**. §1.3 of this
document recorded that `generateHPDDraft` called `parseStructuredText` directly
and therefore skipped self-correction, French cleanup and confidence scoring.
That bypass is closed:

```
before:  generateHPDDraft → parseStructuredText
after:   generateHPDDraft → buildHpdDraft → runStructuring
                              → detectSelfCorrections
                              → cleanupFrench
                              → parseStructuredText
                              → confidence + reviewRequired
                              → analyzeClinicalSafety
```

There is now **one clinical structuring pipeline** for every active entry point.
Verified after the change: no active production path reaches
`parseStructuredText` except through `runStructuring`. The two remaining direct
callers are `runStructuring` itself and the test suite.

The pure core was extracted to `src/lib/ai/hpd-draft.ts` (`buildHpdDraft`) so the
clinically meaningful behaviour is unit-testable without a database. The server
action keeps its IO: auth, `ai_jobs` / `ai_outputs`, audit.

### A latent defect this surfaced

Routing through the pipeline exposed a **pre-existing bug in `cleanupFrench`**:
`tidy()`'s "one space after punctuation" rule rewrote `3.5 cm` as `3. 5 cm`.
R0.3 guaranteed decimals are never split and enforced it in
`detectSelfCorrections`, but `cleanupFrench` was never checked — so the queue
and live-dictation paths have been corrupting decimal measurements since they
were built. Fixed with a digit-flanked guard covering both `.` and the French
decimal comma. Shipping R2.0 without this would have imported the corruption
into the radiologist path, which previously preserved decimals.

### Review metadata now available

`HpdGenerateResult` gained one additive field, `structuring`, carrying:
`rawTranscript`, `cleanedTranscript`, `correctionEvents` (including
`applied: false` review suggestions), `removedTokens`, `confidence` (including
`autoFilled`), `reviewRequired`, and advisory `warnings` from
`analyzeClinicalSafety` (including `heavy_cleanup_drift`). `SmartStructuringPanel`
surfaces the review-required flag, auto-filled notice, corrections and removed
token count, reusing the existing `structuring` i18n namespace — no new keys.

### Persistence limitations — READ THIS BEFORE R2.5

Stated precisely, without overclaiming:

- **In memory, per generation:** the full metadata above, for as long as the
  panel holds it. Lost on reload.
- **Persisted:** the metadata is written to `ai_outputs.raw_response` (an
  existing column reserved for provider envelopes — no schema change). It is
  therefore auditable per AI job.
- **NOT persisted anywhere the signing gate reads.** `finalizeReport` obtains
  confidence via `getReportSafetyContext`, which resolves
  `report → vacation_items.report_id → transcriptions`. A report created
  directly from a study has no queue item, so that lookup returns null and
  `aiConfidence` is null at signing time. **`ai_outputs.raw_response` is not
  consulted by the gate.** R2.0 does not change this and does not weaken the
  gate to compensate.
- **Consequence:** on the direct-from-study path the AI-review blocker still
  cannot fire. The empty-section and low-confidence blockers, which are computed
  from the report's own current content, are unaffected and still apply.

**Exact fields needed later (migration 044+, not implemented):**

| Table | Field | Purpose |
|---|---|---|
| `transcriptions` | `report_id uuid NULL REFERENCES reports(id) ON DELETE SET NULL` | let a transcript bind directly to a report |
| `transcriptions` | relax `vacation_item_id` to `NULL` + CHECK exactly one owner | a transcript belongs to a queue item **or** a report |
| `vacation_items` | `UNIQUE (report_id) WHERE report_id IS NOT NULL` | make the existing reverse lookup provably single-valued |

With those, `getReportSafetyContext` becomes a two-branch lookup and the signing
gate sees confidence on both paths.

### Still not started

- **Live structuring UI / live section population.** Unstable transcript
  prefixes must still not drive automatic report mutation — `runStructuring` is
  non-monotonic on partial input (§8.1), and `splitStableTranscript` (§8.2) is
  the boundary that must gate any future live feed. R2.0 structures a
  **complete** transcript submitted by the radiologist; nothing streams.
- **Migration 044**, `dictation_sessions` / `transcriptions` schema changes,
  report-linked QR dictation.
- **Product Surface Freeze**, unified workspace shell, report-editor redesign,
  navigation changes.
- Template ingestion. Legacy code removal. The `external-ai.ts` append bug
  (§12.1) remains open.

---

## R2.1 implementation status

**Gate R2.1 — product surface freeze. COMPLETE.**

The product now presents one workflow. A normal radiologist's navigation is
**New Report · Reports · Templates**; everything else listed in §1.4 as
`DEPRECATE LATER` — plus Dashboard, Patients, Studies, Vacation Queue, Secretary
Desk, Analytics, Critical Queue, Audit History, Feedback and Pilot — is frozen
out of the surface. **Nothing was deleted**: routes, actions, tables, RLS,
migrations, audit events and history are untouched.

Scope is decided once, in `src/config/product-scope.ts`, classifying every
feature as CORE / SUPPORTING_HIDDEN / FROZEN / ADMIN_ONLY. Navigation and the
middleware redirect both derive from it, so the surface cannot drift between
them. The full rationale is in
[`docs/product/radiora-simple-scope.md`](../product/radiora-simple-scope.md).

**Landing.** `/[locale]/reports` replaces the dashboard after login and is where
frozen routes redirect, preserving locale. The Reports page gained a prominent
New Report action, plain-language statuses, bounded retrieval (page size 50 —
previously unbounded, which silently truncated at Supabase's 1000-row cap) and
an empty state that starts the workflow.

**Canonical entry.** `/[locale]/reports/new` is the one New Report route. It is
an entry shell: it names the six-step workflow and reuses the existing
`createReport` server action against examinations that have no report yet. No
patient, study or report creation logic was duplicated. R2.2/R2.3 replace step 2
onward with the unified dictation workspace; the creation call stays as-is.

**Unchanged and verified by test.**

- QR/mobile dictation is CORE: `/m/*` is on the never-redirect allowlist, along
  with `/api/*`, `/auth/*`, public delivery `/r/*` and `/reports/[id]/print`.
- The R2.0 canonical structuring path, the signing gate and the R0.8 authority
  boundary are untouched. Administrative access still grants **no** clinical
  signing authority.
- The canonical export model is unchanged.

**Still pending.** Migration 044 (report-linked transcripts and QR), live
section population, and the full workspace redesign. Live structuring must
still gate on `splitStableTranscript` (§8.2) before any partial transcript is
allowed to mutate a report.

---

## R2.2 implementation status

**Gate R2.2 — report-linked dictation ownership. COMPLETE (code); migration 044
AWAITING MANUAL ACTIVATION.**

§6 and §7 of this document recorded the two hard blockers: `dictation_sessions`
and `transcriptions` were `NOT NULL` on `vacation_item_id`, so a report created
from a study could neither start QR dictation nor own a transcript — which is
why its AI review metadata could not survive a reload.

### Ownership model (migration 044)

The **same** dictation subsystem now supports two owner kinds. No second audio
or transcription subsystem exists, and the vacation-item workflow is untouched.

| Table | Rule | Constraint |
|---|---|---|
| `dictation_sessions` | `vacation_item_id` **XOR** `report_id` | `dictation_sessions_one_owner` |
| `transcriptions` | `vacation_item_id` **XOR** `report_id` | `transcriptions_one_owner` |
| `audio_assets` | `vacation_id` **NAND** `report_id` | `audio_assets_single_owner` |

`audio_assets` is deliberately NAND rather than XOR. It has no
`vacation_item_id` at all — its queue link is the nullable `vacation_id` plus
the reverse pointer `vacation_items.audio_asset_id` — and the table exists to
model **unassigned** audio: `ingestion_mode` `batch`/`long` with status
`uploaded`, which `uploadAudio()` writes with no owner. Requiring an owner would
break batch ingestion and reject existing rows. Both owners at once is still
forbidden, which is the property that matters for isolation.

**Delete behaviour**, chosen deliberately: `dictation_sessions.report_id`
CASCADE (a pairing capability is meaningless without its owner, matching the
existing `vacation_item_id`); `transcriptions.report_id` CASCADE (same as the
queue owner; the signed report's own provenance lives in `report_versions`,
untouched); `audio_assets.report_id` SET NULL (matching `vacation_id` — deleting
the clinical owner must not silently orphan a private storage object without a
row accounting for it).

`vacation_items` gained `UNIQUE (report_id) WHERE report_id IS NOT NULL`, making
real the single-valued assumption `getReportSafetyContext` already relied on.

### Clinic isolation

RLS on these tables keys off the **row's own** `clinic_id`, so it cannot stop a
caller from pointing a correctly-scoped row at another clinic's report. A new
`enforce_dictation_owner_clinic()` trigger on all three tables validates that
the owner and the row share a clinic — for the queue owner too, which was never
checked. **No RLS policy was widened, dropped or changed.**

### Transcription persistence and the signing gate

`getReportSafetyContext` now resolves in two steps: the **report-owned**
transcript first (most recent, since a report may be dictated in several
passes), then the queue-owned one through `vacation_items.report_id`. A missing
transcript still returns `null`, and `null` still means "no AI metadata" — never
high confidence. The gate was not weakened.

`structureReportTranscript` persists the four layers (`cleaned_text`,
`correction_events`, `structured_json`, `confidence`) on the report-owned row,
which is what makes R2.0's review metadata survive save/reload on the direct
path. **No additional field beyond ownership was required**, and no duplicate
report-content storage was introduced.

### QR token resolution

A session token resolves to exactly one owner and one clinic, recorded when the
session was minted; the phone never states where audio belongs. `uploadFromMobile`
reads the owner off the stored session, re-checks at upload time that a
report-owned target is still unsigned, and branches: the queue path is
byte-identical to before, the report path touches no queue row. The phone page
shows exam type, accession number and modality only — never the patient name,
report content, history or demographics.

### R2.3 dependency

The unified workspace can now persist everything it captures against a report:
session, audio, transcript and structuring metadata. R2.3 builds the UI on top
of these actions. Live section population remains gated on
`splitStableTranscript` (§8.2) — R2.2 structures a **complete** transcript only.
