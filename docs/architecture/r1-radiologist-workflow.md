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

---

## R2.3 implementation status

**Gate R2.3 — unified New Report workspace. COMPLETE.** No migration.

### Composition

The three technical accordions the doctor used to choose between — "Classic
recording", "Live dictation", "AI Structuring" — are replaced inside the report
editor by **one** `DictationWorkspace` asking a single clinical question:
*How would you like to dictate?* → **This computer · My phone · Import a file**.

All three feed the same report-owned transcript and the same canonical
pipeline. Nothing was rebuilt:

| Concern | Reused |
|---|---|
| Browser speech | `useSpeechRecognition` — the single binding; no third implementation |
| QR pairing | `createReportDictationSession` (R2.2) + the existing `/m/[token]` recorder |
| Audio import | the private `dictation-audio` bucket, same size/MIME limits |
| Transcript | `saveReportTranscript` → report-owned row (migration 044) |
| Structuring | `structureReportTranscript` → `buildHpdDraft` → `runStructuring` |
| Report editing | the existing `StructuredEditor` — the workspace renders dictation only |
| Signing / export | the existing gate, `buildReportExportModel` and renderers, untouched |

`VoiceDictationPanel`, `LiveDictationPanel` and `SmartStructuringPanel` remain in
the repository and still serve the vacation queue; only the report editor stopped
composing them.

### State model

`src/lib/reports/workspace-state.ts` — a 15-state machine (setup →
ready_to_dictate → recording / phone_waiting / phone_recording / audio_uploaded
→ transcribing → transcription_ready → structuring → review_ready → saving →
saved → signing_blocked → signed, plus error) with an explicit transition table.
No scattered booleans; an invalid event is ignored rather than crashing or
jumping.

**The safety-critical property, asserted by test across every state:**
`structuring` can only be ENTERED from `transcription_ready`. There is no path
by which interim speech reaches a clinical section. The live transcript is shown
as transcript, the doctor stops and reviews it, and the structured draft is
applied by an explicit radiologist action.

### Entry and navigation

`/[locale]/reports/new` stays the canonical entry: it selects an examination
without a report, reuses `createReport`, and redirects to `/reports/[id]` where
the workspace lives. This deliberately avoids a second report editor — the
report route remains the single place a report is edited, so refresh, the back
button and direct report links all behave normally.

### Reload behaviour

The report page passes the report-owned transcript into the editor via
`getReportSafetyContext`, so a refresh reconstructs report content, the
transcript relationship and the signing-safety context together.

### Not started

Continuous live section mutation, `splitStableTranscript` UI, template
ingestion, PACS/RIS integration. The external-AI append bug remains open.

---

## R2.4 implementation status

**Gate R2.4 — stable live transcript boundary. COMPLETE.** No migration.

> **R2.4 does NOT populate report sections live.** It establishes the boundary
> that will make live structuring safe later; the doctor still presses
> "Structure the report" on a complete transcript, exactly as in R2.3.

### Three transcripts, deliberately not one string

| | What it is | Persisted? | Structurable? |
|---|---|---|---|
| **Interim** | the recogniser's current guess | no | **never** |
| **Stable** | finalized segments that passed the guards | in memory during recording | yes |
| **Canonical** | ordered concatenation of committed segments | yes, on stop | **the only input** |
| Structured state | derived from canonical, separate from provenance | yes | — |

`src/lib/dictation/transcript-stability.ts` owns all four. It is pure — no DOM,
no clock, no IO; timestamps are injected, and a test asserts the absence of
`Date.now`, `Math.random` and `fetch`.

### The stability algorithm

Stability is **not** a timer. A boundary must be a real sentence terminator, and
the text before it must survive every guard. The rule is fail-conservative:
uncertain text stays interim, because a moment's delay costs the doctor nothing
while a wrongly-frozen clause corrupts a clinical record.

1. Scan backwards for `.`, `!`, `?` or newline.
2. Skip a `.` flanked by digits — `3.5 cm` is one value, not two sentences.
3. Skip a `.` that follows a digit with nothing after it yet — `12.` may still
   become `12.5`.
4. Walk the boundary back while the would-be stable text ends in an unfinished
   clinical statement; everything pulled back rejoins the interim tail.

Guards (each keeps text interim):

- **Correction prefix** — `je corrige`, `correction`, `rectification`,
  `non, plutôt`, `ou plutôt`, `remplacez (par)`, `supprimez`, `erreur`,
  `pardon`, and a bare standalone `non`. The bare `non` alternative is
  end-anchored so it matches `". Non."` but never `"non compliqué"`.
- **Incomplete measurement** — a trailing number, a number plus a decimal
  separator (`12 virgule`, `3 point`), or a partial unit (`14 millim`).
- **Incomplete negation** — `pas de`, `absence de`, `sans`, `aucun`, `ni` with
  nothing after them. Freezing `"Pas de."` would assert a finding nobody made.
- **Incomplete laterality** — `du`, `de la`, `au niveau`, `lobe`, `segment`,
  `côté` … Laterality is never inferred and never taken from a template.

This directly closes the non-monotonic failure R1 found: a dictated retraction
whose replacement has not arrived is held back rather than emptying the report.

### Interim / final handling and deduplication

The browser re-delivers finalized results and can repeat or reorder callbacks.
`commitFinalized` takes the recogniser's **cumulative** final text and diffs it
against what is already committed, appending only genuinely new text. On
divergence — a restart, a reordered index — the existing record wins and only
the unseen remainder is considered: **committed segments are never rewritten or
removed.** Segment identity is deterministic (`seg-1`, `seg-2`, …) from the
sequence, never random, and each segment carries its character range in the
canonical transcript.

`useSpeechRecognition` was extended additively with `finalText`, `interimText`
and an `onFinalText` callback; `transcript` remains the merged view, so existing
consumers (the queue's `LiveDictationPanel`) are unaffected. The hook still only
recognises speech — a test asserts it never calls the structuring engine.

Committing is wired to the **recognition event**, not to an effect: settling
speech is something that happened, not state to be synchronised, so the
workspace reduces inside `onFinalText` and the guess is never mirrored into
component state. The callback fires only when the cumulative final text actually
changed, so an interim-only tick cannot re-run the reducer. The workspace holds
committed segments; interim is read straight off the hook for display.

### One algorithm

`splitStableTranscript` (the R1 contract) now delegates to `stableBoundary`, so
the R1 helper and the live boundary cannot diverge. All R1 tests pass unchanged
against the shared engine.

### Phone and imported audio

Neither has an interim phase. `commitCompleteTranscript` records their finished
transcription as committed segment(s), so every source shares one transcript
model without inventing fake segmentation for them.

### Persistence — exactly what survives

- **Refresh during active browser dictation:** stable segments are client state
  and are **lost**. There is no active-session recovery in R2.4, and none is
  claimed. The report itself is untouched.
- **Stop:** stable segments are flushed to the canonical transcript and
  persisted via `saveReportTranscript` (report-owned, migration 044). An
  unfinished clause comes back as `pending` and is appended verbatim for the
  doctor to edit — never frozen as clinical text, never silently discarded.
- **Reload after a completed transcription:** the canonical transcript, the
  report content, the transcript relationship and the signing-safety context all
  reconstruct through `getReportSafetyContext`.

Interim text is never durably persisted, by design.

### The seam R2.5 will consume

`structuringInput(state)` returns the canonical transcript and **excludes
interim by construction**. That is the single function R2.5 calls to feed
incremental structuring — the transcript model will not need redesigning again.

---

## R2.5 implementation status

**Gate R2.5 — live AI section population. COMPLETE.** No migration.

> **AI structures; the radiologist controls.** Nothing here signs, nothing here
> invents, and nothing the doctor typed is ever overwritten without them saying
> so.

### What the engine actually does on a growing transcript

The architecture was chosen from measurement, not assumption. `runStructuring`
was run against growing **stable** transcripts (R2.4 boundary — complete
sentences only) and the section outputs recorded per revision:

| revision | RÉSULTATS | CONCLUSION |
|---|---|---|
| 4 | `…segment VII.` | `14 mm.` |
| 5 | `…segment VII. 14 mm.` | `Pas de lésion splénique.` |
| 6 | `…segment VII. 14 mm. Pas de lésion splénique.` | `Au total, nodule hépatique de 14 mm…` |

Three facts came out of this, and they drive everything below:

1. **RÉSULTATS only ever grew** — each new value began with the previous one.
2. **CONCLUSION was wholly replaced every revision.** Until the doctor dictates
   an explicit marker ("Au total", "Conclusion"), the engine's conclusion is a
   positional guess. Auto-applying it would make the doctor watch their
   conclusion flicker between unrelated sentences.
3. **`14 mm.` migrated** out of CONCLUSION into RÉSULTATS — a real section
   reassignment, not a hypothetical one.

### Incremental coordinator

`src/lib/reports/live-coordinator.ts` is the module that decides. It is pure —
no React, no IO, no clock, no network — and a test asserts that. Components
orchestrate: they open a revision, hand back a result, and render the outcome.

```
stable segments → canonical stable transcript → beginRevision
  → buildHpdDraft (the canonical pipeline, run locally)
  → reconcile → classification → applyStructuredPatch (R1)
  → StructuredReportData → editor / save / PDF / DOCX / print / signed
```

### Contracts reused, not replaced

The R1 freeze was sound and is used as shipped: `LiveReportState`,
`SectionState`, `SectionPatch`, `StructuredReportPatch`, `PatchLogEntry` and
`applyStructuredPatch` are unchanged. R1's rules — never blank a section, never
overwrite a locked one, template origin always carries reviewRequired, log every
decision — run underneath the coordinator as an independent backstop, so a
classification bug cannot silently destroy clinical text.

Two additions were made rather than a new abstraction:

- `hasExplicitSectionHeader()` exported from `structuring-engine.ts` — one
  definition of header detection, so the coordinator can tell a section the
  doctor NAMED from one the engine inferred, without copying `HEADER_HINTS`.
- `SUGGESTION_ONLY`, a fifth update class (below).

### Input strategy — full reprocessing (strategy A)

Every revision reprocesses the **whole** stable transcript. The engine is a
function of a complete transcript; feeding it deltas would make it a different
engine. Measured cost on a 9-sentence, 378-character dictation: **1.7 ms mean,
7.5 ms worst case** per revision, entirely local and deterministic. An unchanged
transcript costs nothing — 1000 repeat submissions returned in 9 ms without
running the engine once.

The pipeline runs in the browser via `buildHpdDraft`, the same module the server
action uses. No second engine, no network, no external model, and no clinical
text leaves the page.

### Revision model and stale-result protection

Every attempt carries a monotonically increasing revision. `reconcile` discards
any result at or below `appliedRevision` and returns the previous state object
**identically** — the test asserts reference equality, not merely deep equality.
So:

```
revision 4 starts → revision 5 starts → revision 5 lands → revision 4 lands → discarded
```

The engine is synchronous today. The revision model exists so a future async
provider cannot cause a stale write, and it is tested against the out-of-order
case directly rather than by timing.

### Update classification

| class | written? | when |
|---|---|---|
| `NO_CHANGE` | — | identical text, or a blank proposal over existing content |
| `SAFE_AUTO_APPLY` | yes | target empty or purely extended, and nothing flagged |
| `REVIEW_REQUIRED` | yes, flagged | nothing is lost, but a human must look |
| `SUGGESTION_ONLY` | **no** | would rewrite AI content already on screen |
| `CONFLICT_WITH_PHYSICIAN_EDIT` | **no** | the radiologist owns the section |

`SUGGESTION_ONLY` goes beyond the four classes R2.5 specified. It exists because
those four collapse two different situations into `REVIEW_REQUIRED`: content
that is safe to show but needs eyes, and content that would **destroy what the
doctor is already reading**. Only the first belongs in the report. The
distinction is the extension test — does the new text start with the old? — and
it is exactly what separates the RÉSULTATS column above from the CONCLUSION one.

Flags that hold a section back from silent auto-apply:

| flag | meaning |
|---|---|
| `autoFilled` | the TECHNIQUE protocol template — the only machine-authored text in the product |
| `lowConfidence` | the engine scored the section low |
| `inferredConclusion` | a conclusion the doctor never marked |
| `rewrite` | the proposal replaces rather than extends |
| `sectionReassigned` | text appears to have moved between sections |
| `ambiguousCorrection` | a dictated correction the engine refused to localize (report-level) |
| `cleanupDrift` | raw vs cleaned transcript diverged heavily (report-level) |
| `physicianOwned` | the radiologist authored it |

**Known limitation.** `ambiguousCorrection` and `cleanupDrift` are report-level,
not per-section. A `CorrectionEvent` carries a character offset into the RAW
transcript while sections are sliced from the CLEANED one, with no ranges to map
between them. Rather than guess a section, both are surfaced report-wide and
hold every section in that revision back from silent auto-apply. Per-section
attribution needs `sourceRange` support in `parseStructuredText` — R2.6.

### AI never invents findings

Pinned at the coordinator boundary: a section whose origin is `template` can
never be `SAFE_AUTO_APPLY`. A template may define section names and order; it
may not cause clinical content to appear. If the doctor said nothing about a
structure, it stays empty — no "normal", no "sans particularité", no "pas de
lésion". The test traces every word of every clinical section back to a word in
the transcript.

One engine behaviour is worth recording, because live population makes it
visible where the Structure button used to hide it: when only an indication has
been dictated, `parseStructuredText` also echoes that sentence into RÉSULTATS.
That is **duplication of the doctor's own words**, not invention — long-standing
behaviour, unchanged by R2.5, and a candidate for R2.6 parse-quality work.

### Physician-edit locks

Section-level, in the real section model — never DOM comparison. Any edit to a
section's textarea routes through `updateSection`, which writes the text and
calls `notePhysicianEdit`, marking the section `radiologist`-authored and
locked. From then on live AI proposes into `suggestions[section]` and never
writes. The doctor can accept the proposal, dismiss it, or hand the section back
to AI ("Reprendre la dictée IA"). Accepting does **not** hand the section back —
it writes the text and the section stays theirs.

All five canonical sections are protected: indication, technique, results,
conclusion, recommendations. Specialized structured-exam fields (F18 measurement
tables) are **not** live-populated: the dictation workspace is not rendered for
special forms at all, so those reports keep the existing typed-table flow
untouched. That is a deliberate limitation, not an oversight.

### Corrections

Handled by the existing preservation-first engine; the coordinator's job is to
not destroy. A correction that cannot be resolved safely leaves the original
text in place, raises `ambiguousCorrection`, and blocks silent auto-apply for
that revision. Tests assert that after "Je corrige, 14 mm" the lesion identity
survives — organ, location and laterality all still present — and that decimal
points, French decimal commas, negations, laterality and uncertainty terms all
survive a live pass unchanged.

### Live UI

Dictation sits on the left (sticky on wide screens), the report document on the
right, stacking in the same order on narrow screens. When live structuring
writes a section it gets a brief, calm tint — a colour transition only, disabled
entirely under `prefers-reduced-motion`.

Per-section chips speak clinically and never expose internals: no revision
numbers, no parser or model names, no confidence decimals. "Modifié par vous",
"Suggestion IA" with Accepter / Refuser, "Technique proposée automatiquement",
"Conclusion inférée", "Correction ambiguë". A held-back proposal is always shown
in full, so accepting is never a blind choice. Nothing about review blocks
dictation from continuing.

### Stop / final reconciliation

On stop the workspace flushes the final speech callback, keeps the pending
unfinished clause, appends it verbatim to the canonical transcript, persists it,
then runs **one** forced final revision over the complete text. `force` exists
precisely so that the final pass still happens when the transcript is
byte-identical to the last live one. The result is reconciled against physician
edits like any other revision; remaining flags stay visible and the workspace
enters `review_ready`. Nothing is auto-signed.

Phone and imported audio produce a complete transcript with no interim phase.
They use the same coordinator as a single complete revision once the transcript
is confirmed — no fake streaming is fabricated for them.

### Persistence — exactly what is durable

- **During dictation:** live sections, locks, flags, suggestions and the
  revision counter are **client state**. A refresh loses them. No migration was
  added and no active-session recovery is claimed.
- **On save:** live sections are already projected into `structuredDraft`, so
  the normal report save persists them as canonical `structured_data`, together
  with the transcript linkage (migration 044) and physician edits. After reload
  the report content, the transcript relationship and the signing-safety context
  all reconstruct.
- **After reload:** every non-empty saved section starts **physician-owned** —
  saved text was authored or reviewed by a human, so a new dictation pass
  proposes rather than overwrites. Lock state is reconstructed conservatively
  rather than persisted.
- The server-side `structureReportTranscript` path is unchanged and still writes
  the durable `ai_jobs` / `ai_outputs` audit record. Applying its result
  re-baselines the coordinator (`adoptReportData`) so live and server results
  cannot fight each other.

### Signing boundary

Untouched. Radiologist only, no administrative override. Live AI ceases the
moment a report is finalized: the workspace is not rendered, the hook is
constructed frozen, every mutating action is guarded, and `reconcile` returns
`frozen` and changes nothing. Existing blocking flags, required sections and
confirmation rules for auto-filled content are unchanged.

### What remains for R2.6 / R2.7

- `sourceRange` from `parseStructuredText`, so corrections and cleanup drift can
  attribute to a section instead of the whole report.
- Parse-quality work on section splitting (the indication/results echo above).
- Live population for specialized structured-exam forms.
- Active-session recovery, if it is ever wanted; it does not exist today.
- R2.7: seamless phone behaviour.

---

## R2.6 implementation status

**Gate R2.6 — section accuracy, corrections and provenance. COMPLETE.** No migration.

> **Empty section > incorrect duplicated clinical content.**
>
> A section left blank costs the radiologist a sentence of typing. A section
> filled with the wrong clinical statement is a reporting error that survives
> into the PDF, the signature and the patient's file.

### Root cause of the indication → findings duplication

`parseStructuredText` split the transcript on header keywords, then ran a
fallback:

```js
if (!foundSections || (!sections.results && !sections.conclusion)) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length >= 2) {
    const cutoff = Math.max(1, Math.ceil(sentences.length * 0.7))
    if (!sections.results)    sections.results    = sentences.slice(0, cutoff).join(' ')
    if (!sections.conclusion) sections.conclusion = sentences.slice(cutoff).join(' ')
  } else {
    if (!sections.results) sections.results = text        // ← the WHOLE transcript
  }
}
```

Two defects, compounding:

1. **The `||`.** The fallback fired whenever RÉSULTATS and CONCLUSION were both
   empty — *even when a header had been found*. "Indication traumatisme
   crânien." routed correctly to INDICATION, then the fallback copied the entire
   transcript, header text included, into RÉSULTATS.
2. **No boundary after a header.** The split only fired at `KEYWORD :` or
   `KEYWORD\n`, so an explicit header captured everything to the end of the
   transcript. Findings dictated after "Indication : …" without the doctor
   saying "Résultats" stayed in INDICATION.

A third, related defect: the fallback's 70/30 positional split is what made
CONCLUSION churn on every revision in the R2.5 measurements.

The fix is in the canonical layer, so the vacation queue, live dictation,
`generateHPDDraft` and any future template workflow all inherit it.

### Section routing

`src/lib/ai/section-router.ts` routes **sentence by sentence**. Precedence:

| | signal | provenance |
|---|---|---|
| 1 | explicit header — "Résultats :", "Indication traumatisme crânien." | `explicit_header` |
| 2 | strong marker — "Au total,", "Conduite à tenir" | `semantic` |
| 3 | weak cue — findings/technique/indication vocabulary | `semantic` |
| 4 | continues the open section | `continuation` |
| 5 | nothing open, nothing recognised → RÉSULTATS | `inferred` |

**Every sentence lands in at most one section.** There is no pass that copies
text anywhere, so duplication cannot be created by routing.

Two rules make this behave like real dictation:

- **The report flows forward.** Weak evidence may advance along
  indication → technique → results → conclusion → recommendations, never
  rewind. So "Indication : céphalées. Petite hyperdensité frontale droite."
  moves on to RÉSULTATS, while "Résultats : masse pulmonaire. Suspicion de
  malignité." stays in RÉSULTATS — "suspicion de" is indication vocabulary, but
  the doctor is plainly still describing what they saw. Moving backwards needs
  an explicit header or a strong marker.
- **Markers must open the clause.** "Au total" is a conclusion marker at the
  start of a sentence and ordinary French in the middle of one: "il existe au
  total deux lésions" is a finding, and stays one.

The bare header form ("Indication traumatisme crânien." — no colon) is accepted
only for the primary section names. A sentence merely starting with
"Description" or "History" is not evidence enough to reroute clinical text. A
plural is not a header either: "Indications opératoires discutées." is a
sentence, not an INDICATION section.

### Findings fallback

RÉSULTATS is the destination for unrecognised clinical dictation, which is
correct — most of a report is findings. It is **not** a catch-all: a sentence
goes there *instead of* somewhere else, never *in addition to* it. An
indication-only or technique-only transcript now leaves RÉSULTATS **empty**.

Consequence worth stating plainly: the signing gate requires RÉSULTATS and
CONCLUSION on a structured report, so a doctor who dictates only an indication
can no longer sign until they write the rest. That is the intended trade — the
alternative was a report whose findings section repeated the referral question.

### Conclusion is never guessed

A conclusion now requires an explicit header or a strong marker. The positional
70/30 guess is gone. If no conclusion can safely be inferred, CONCLUSION stays
empty for the doctor to write. Inferred content that does arrive (via
`continuation` or `inferred` provenance) is still REVIEW_REQUIRED and can never
auto-apply.

### Provenance model

`SectionProvenance` is threaded through the existing types rather than
duplicated: `SectionConfidence.provenance` on the per-section score, plus
`StructuringResult.provenance` / `.sectionRanges` / `.duplication` and the same
fields on `HpdStructuringMeta`.

| provenance | meaning |
|---|---|
| `explicit_header` | the doctor dictated the section name |
| `semantic` | classified from clinical language |
| `continuation` | continues the section already open |
| `inferred` | no signal; default destination |
| `auto_filled` | generated from exam metadata (the protocol template) |
| `physician_edit` | written by the radiologist |

`sectionRanges` carries character offsets back into the transcript, so a review
flag can point at the sentence responsible — text provenance, no waveform
synchroniser.

### Duplication detection

`src/lib/safety/section-duplication.ts` compares **clauses**, never words.
Radiology repeats its vocabulary constantly; flagging that would bury the real
cases.

| kind | test | acted on? |
|---|---|---|
| `exact` | identical ignoring case, accents, punctuation, spacing | yes |
| `near` | Jaccard ≥ 0.8 over clauses of ≥ 4 tokens | yes |
| `overlap` | Jaccard ≥ 0.5 — shared terminology | **never** |

Unresolved exact/near duplication sets `reviewRequired` on the structuring
result and raises a `duplicateContent` flag on both sections in the live
coordinator.

### Safe auto-repair

`repairSectionDuplication` removes a duplicate **only when provenance proves
which copy is wrong**:

| situation | action |
|---|---|
| authoritative + fallback, neither locked | drop the fallback copy |
| either side physician-owned | keep both, raise for review |
| both authoritative, or both fallback | keep both, raise for review |
| `overlap` | nothing |

Authoritative = `explicit_header`, `semantic`, `auto_filled`, `physician_edit`.
Fallback = `continuation`, `inferred`. The protocol template is authoritative
for TECHNIQUE, so a copy of it in RÉSULTATS is the copy that goes.

Because the router can no longer create duplicates, this is a net rather than a
routine path — it catches content arriving from applied templates, external-AI
appends and legacy reports, none of which pass through the router.

### Correction target resolution

The correction and its target are usually in **different** sentences. Before
R2.6, "…mesurant 12 mm. Je corrige, 14 mm." appended the replacement as a new
clause, so the report said both 12 mm and 14 mm — and "Présence d'épanchement
pleural. Je corrige, absence d'épanchement pleural." left **both polarities
standing**, which is worse than either alone.

`resolveCorrectionTarget` now resolves the replacement against the preceding
clause, and refuses ambiguity:

| replacement | behaviour |
|---|---|
| a measurement | replace the one measurement in the clause; **two candidates → refuse** |
| a laterality word | replace the one laterality token; **two candidates → refuse** |
| anything else | whole-clause replacement, under the existing preservation guards |

A refusal preserves the original text verbatim, keeps the correction visible,
and emits `CorrectionEvent { applied: false }` → `ambiguousCorrection`. Both the
inline path ("Je corrige, …") and the standalone path ("Non." then the
replacement) go through it.

Result: `"Nodule du lobe supérieur droit mesurant 12 mm. Je corrige, 14 mm."`
→ `"Nodule du lobe supérieur droit mesurant 14 mm."` — lesion, lobe, laterality
and units all intact, provenance recording `12 mm → 14 mm`.

### Measurement, laterality and negation safety

One decimal-safe sentence splitter (`src/lib/ai/sentences.ts`) is now shared by
self-correction, routing and duplication detection: a boundary one module sees
and another does not is how a correction lands on the wrong finding. A `.`
between digits is a decimal separator, never a boundary.

Pinned by test: `3.5 cm`, `3,5 cm`, `12 x 8 mm`, `12 × 8 mm` survive the whole
pipeline, and a paired measurement can be corrected as a unit. Laterality is
changed only when exactly one laterality token is present. Negation is never
inverted: a corrected polarity **replaces** the clause rather than sitting
beside it, and an uncorrected negation passes through untouched.

### Uncertainty

`possible`, `probable`, `compatible avec`, `évoquant`, `suspect`,
`ne peut être exclu` and `vraisemblablement` all survive routing, cleanup and
reconciliation verbatim. "compatible avec" is never promoted to "diagnostic
de"; "possible" is never promoted to "présence de". Any certainty drift is
already caught by the R0 uncertainty fail-safe and surfaces as REVIEW_REQUIRED.

### Physician ownership

Unchanged from R2.5 and now also binding on repair: a physician-edited section
is never auto-repaired, never auto-removed, and never re-routed. Text being
identical to AI output does not make it AI-owned after a physician edit —
ownership is tracked on the section, not inferred from the text.

### Live coordinator integration

The coordinator reads provenance directly instead of re-deriving it by
re-scanning the transcript, and gains two flags: `sectionInferred` (routed by
classification rather than a dictated header) and `duplicateContent`. Both hold
a section back from `SAFE_AUTO_APPLY`, so an update auto-applies only when the
destination is reliable, non-destructive, duplicate-free, drift-free, unlocked
and free of ambiguous corrections. R1's `applyStructuredPatch` still runs
underneath as an independent backstop — none of its safeguards were weakened.

### External-AI append fix

`applyAcceptedFindingsToReport` appended the suggestion block to the legacy
`findings` **column only**. Structured reports keep their content in
`structured_data`, and `getReportSections` reads the structured payload first —
so on a structured report the accepted findings were written somewhere nothing
renders: absent from the editor, the PDF, the DOCX and the print view, while
the action reported success. Its version snapshot was hand-rolled, omitted
`clinic_id`, and ignored every returned error.

Fixed:

- content goes through `applyExternalAiFindings` into canonical
  `structured_data.results`, with the legacy `findings` column mirrored exactly
  as `ReportEditor.updateSection` does — no parallel content model;
- legacy reports (no `structured_data`) still write only `findings`;
- the snapshot goes through the shared R0.2 `createReportVersion`, which carries
  `clinic_id` and `structured_data`, checks the returned error and retries a
  version-number race; a snapshot failure now aborts the write;
- every Supabase read is error-checked;
- the finalized-report refusal still runs before anything is written.

### Persistence

No migration. Everything R2.6 adds is derived, not stored:

- **Provenance, duplication findings and section ranges are active-session
  state.** They are recomputed by `runStructuring` from the transcript on every
  pass, so they survive a reload only in the sense that re-running the engine
  reproduces them. They are not persisted, and no claim is made that they are.
- `ai_outputs.raw_response` continues to store the structuring result for the
  server-side path, so provenance for that run is recoverable from it.
- Canonical clinical content persists exactly as before: `structured_data` on
  the report, transcript linkage from migration 044, version snapshots through
  `createReportVersion`.
- Physician lock state is reconstructed conservatively on reload (every
  non-empty saved section starts physician-owned), unchanged from R2.5.

### What remains

- Per-section attribution for `ambiguousCorrection` and `cleanupDrift`: both are
  still report-level, because a `CorrectionEvent` offset points into the RAW
  transcript while sections are sliced from the CLEANED one. `sectionRanges`
  is the groundwork; mapping raw↔cleaned offsets is the remaining piece.
- Live population for specialized structured-exam forms (F18 tables).
- Active-session recovery — still does not exist.

---

## R2.7 implementation status

**Gate R2.7 — seamless QR / mobile dictation handoff. COMPLETE.** No migration.

> **The phone is a microphone for the same report.** It is not a second
> workflow, and the doctor never meets the words session, token, capability or
> queue item.

### An honest statement of what the phone does

**Radiora has no automatic speech-to-text for uploaded audio.** `uploadFromMobile`
attaches the recording to the report and opens a transcript row whose `raw_text`
is empty; a person writes the transcript. Nothing in the codebase transcribes an
audio file — only the workstation microphone produces text, via the browser's
Web Speech API in real time.

So the phone's job is to capture dictation as audio bound to the right report
without the doctor being at the workstation. R2.7 makes that handoff seamless
and honest; it does not invent a transcription service. The desktop vocabulary
therefore stops at **"Enregistrement reçu"** and then asks for the transcript,
rather than showing a "Preparing transcription" spinner over work nobody is
doing.

### Audit verdicts

| Component | Verdict |
|---|---|
| 192-bit capability token, TTL, one-owner scoping | **REUSE** — sound, untouched |
| QR generation (local `qrcode`, no external service) | **REUSE** |
| `ownerFromRow` / R2.2 ownership, migration 044 trigger | **REUSE** |
| Service-role upload with the key never leaving the server | **REUSE** |
| `getMobileContext` low-PHI projection | **REUSE** |
| `MobileRecorder` capture, level meter, review-before-send | **REUSE** — no second recorder |
| `getDictationSessionStatus` expiry | **BUGFIX** |
| `markDeviceConnected` expiry | **BUGFIX** |
| Upload idempotency | **BUGFIX** |
| `recording` status never set | **BUGFIX** |
| Desktop panel, status vocabulary, reload recovery | **POLISH** |

### The four defects fixed

1. **The desktop polled a dead QR forever.** Nothing ever wrote `expired` except
   an upload attempt, so a session left on screen reported `pending`
   indefinitely and the 2.5 s poll never stopped. Expiry is now resolved against
   the clock by `effectiveSessionStatus`, the row is corrected once, and the
   server returns `terminal` so the client loop ends.
2. **An expired link still accepted a connection.** `markDeviceConnected`
   checked status but not the TTL. It now checks both.
3. **A duplicate send could store two recordings.** Two taps that both passed
   the status check would both run the transcript writes and both leave an
   asset. The session is now claimed with an atomic compare-and-set
   (`update … .in('status', ['pending','connected','recording'])`) placed
   **after** the asset row exists (the FK requires it) and **before** any
   transcript write. Exactly one caller sees a row come back; the loser deletes
   its own asset and storage object.
4. **`recording` was in the enum but nothing set it**, so the desktop could not
   distinguish "phone opened the link" from "doctor is dictating". The phone now
   calls `markDeviceRecording` when capture starts.

### Desktop flow

```
"Mon téléphone"  →  QR + countdown  →  scan  →  "Téléphone connecté"
                 →  "Enregistrement sur le téléphone"
                 →  "Enregistrement reçu"  →  transcript  →  structure  →  review
```

`PhoneHandoffPanel` renders the QR, a live countdown, the stage badge and a
Cancel button; when the link dies it offers **"Nouveau lien téléphone"**. Status
is announced through one `aria-live` region and always carries a dot **plus a
word** — never colour alone. The QR has a descriptive `role="img"` label.

### Mobile flow

Unchanged in structure (no second recorder): brand, examination context, one
large capture button, review with playback, Send. R2.7 adds the recording
signal, an `aria-live` phase announcement, a focus-visible ring on Send, and a
**Retry** affordance — a failed upload keeps the recording in memory and returns
to review rather than discarding it.

### Token and session lifecycle

Unchanged and unweakened: 24 random bytes (192 bits) base64url, 30-minute TTL,
bound to one clinic and one owner, and the phone never states where the audio
belongs — the session row does. Cross-report and cross-clinic reuse are
structurally impossible rather than merely checked, because the owner is read
from the row the token resolves to.

**Consumption: one session, one recording.** On a successful upload the session
moves to `completed` and every phone entry point refuses a terminal session.
Retry is possible only *before* a successful claim: storage and asset failures
return before the compare-and-set, so the status is untouched and the same
recording can be sent again.

The raw token is never logged, never returned as a field, and never placed in
audit metadata. `getActiveReportDictationSession` regenerates the QR image from
the stored token but returns only the SVG.

### Desktop status sync

Polling stays at 2.5 s — the architecture has no realtime channel and adding one
for polish alone was out of scope. What changed is that the loop now terminates:
it runs only while the stage is live, stops on `terminal`, and stops on unmount.

Session status maps to a **workspace event**, never to a state assignment:
`workspaceEventForStatus` returns `PHONE_CONNECTED` / `AUDIO_RECEIVED` / `FAIL`
or `null`, and `workspaceReducer` remains the only authority. There is no second
state machine.

### Transcription and structuring handoff

`received` → the workspace enters `audio_uploaded` and shows the transcript
field. Once a transcript exists and is saved, the state becomes
`transcription_ready` and the primary action is **"Structurer le compte rendu"**
— option B of the brief, chosen because there is no machine transcription to
wait on and because R2.5/R2.6 require the radiologist to remain in control.

Phone audio then flows through exactly the same path as every other source:
`runStructuring` → section router → correction engine → provenance and
duplication rules → live coordinator. There is no "mobile AI" branch anywhere.

### Multiple dictation passes

Each pass mints its own session; nothing reuses a token. A second upload for the
same report updates the existing transcript row's `audio_asset_id` rather than
deleting anything, so earlier provenance survives and audio files are never
merged destructively. A finalized report cannot start a new phone session, and
a report signed while a QR is on screen refuses the upload.

### Failure and retry behaviour

| Situation | Behaviour |
|---|---|
| Upload fails / times out | Recording kept, returns to review, **Retry** offered |
| Duplicate Send tap | Client guard, plus the server's atomic claim; one recording |
| Phone closes before sending | Recording is lost — it never left the device |
| QR expires before recording | Phone page shows the link is no longer valid |
| QR expires during recording | Upload refused; desktop shows "Lien expiré" and offers a new link |
| Desktop cancels | Session cancelled; a later upload loses the claim and rolls itself back |

**No offline queue exists.** The recording lives in the page's memory until it is
sent; closing the page loses it. R2.7 does not claim otherwise.

### Reload behaviour

A desktop reload now **rediscovers** a live session by report id and
regenerates the QR from the same token. Re-minting was rejected deliberately: it
would invalidate the link the doctor's phone is already holding and could lose a
recording in progress. If nothing live is found the workspace simply shows the
method picker. Recovery covers `pending`, `connected` and `recording`; a session
whose TTL passed while the desktop was away is marked expired and not restored.

### Audit and privacy

Recorded: `dictation.session_created` (owner kind + id, method, TTL),
`dictation.session_cancelled`, `dictation.session_expired`, and the existing
`dictation.mobile_uploaded` (owner, size, extension). Never recorded: the token,
the pairing URL, transcript text, report content, patient identifiers, or audio.
A test walks every `logAudit` call in the module and fails if a token or URL
appears in any of them.

The phone page carries `robots: index:false`, shows no patient name for a
report-owned session, and a test asserts that no report content vocabulary
(`findings`, `conclusion`, `structured_data`, `signature`, …) appears in either
the page or the recorder.

### Relationship to R3 templates

Nothing here presumes a template library. When R3 arrives, the phone remains a
capture device: templates will shape the report the transcript is structured
into, and the handoff described above is unchanged.

---

## R2.7A implementation status

**Gate R2.7A — automatic speech-to-text for phone and imported audio. COMPLETE.**
**Migration 045 required and included.**

> **STT answers "what words were spoken?". Radiora answers "which section of
> the report do those words belong in?"** Those are different layers, and the
> seam between them is `SpeechToTextResult`. Speech-to-text never writes a
> report section, never signs, never validates.

### The gap this closes

Before R2.7A the phone and import paths attached audio to a report and opened a
transcript row whose `raw_text` was empty — a **person** typed what the doctor
had just dictated. Only the workstation produced text, live via the browser's
Web Speech API. R2.7A makes phone and imported audio transcribe themselves.

### Provider audit — what was already here

Nothing. The repository had **no AI provider, no STT implementation, no audio
dependency and no provider environment variable of any kind**. Radiora's entire
"AI" is the local deterministic engine, and its safety story is stated in the
module headers: *no external model, no network, no PHI leaving the tenant*.

R2.7A therefore introduces the first capability that **can** send data outside
the tenant, and the configuration boundary is built accordingly.

### Provider decision

**Selected: the OpenAI-compatible `POST {baseUrl}/audio/transcriptions`
multipart endpoint family** — not a specific vendor.

Why this and not a named service:

- It is the closest thing to a de-facto standard for speech-to-text, so a single
  adapter is genuinely portable.
- Critically, it is implemented **both** by hosted services **and** by
  self-hostable Whisper servers. The operator can therefore choose a deployment
  in which clinical audio never leaves their own network — the
  privacy-maximising option stays reachable without a second adapter.
- Choosing a specific hosted vendor would have required asserting things about
  retention, data-processing terms and pricing that **cannot be verified from
  this repository or its environment**. Those are contractual facts, not
  engineering ones, and inventing them in a clinical product's documentation
  would be worse than leaving the choice explicit.

**Residual decision for the operator:** which endpoint to point `STT_BASE_URL`
at, and acceptance of that endpoint's terms. Radiora does not ship a default
endpoint, a bundled key, or a vendor SDK.

`STT_MODEL` is likewise not hard-coded — a self-hosted server and a hosted
service name their models differently, and the adapter passes the configured
value through verbatim.

### Configuration

| Variable | Required | Notes |
|---|---|---|
| `STT_PROVIDER` | yes | only `openai-compatible` today |
| `STT_MODEL` | yes | passed through verbatim |
| `STT_BASE_URL` | yes | https, or `localhost` for a self-hosted server |
| `STT_API_KEY` | conditional | required unless the base URL is loopback |
| `STT_TIMEOUT_MS` | no | 5 000–600 000, default 120 000 |
| `STT_LANGUAGE` | no | default `fr` |

**Fails closed.** Unset or invalid configuration means the feature is
unavailable and the doctor is told so. There is deliberately **no mock or
offline fallback** — a clinical product must never manufacture words nobody said
because a service was unreachable. Plain `http` off localhost is refused, and a
remote endpoint without a credential is refused so a misconfiguration cannot
post audio to an open endpoint.

None of these are `NEXT_PUBLIC_`, so Next never inlines them into a client
bundle. They are reproduced in full in `docs/operations/r0-safety-activation.md`
because `.env.example` is untracked (`.gitignore` excludes `.env*`). Three tests enforce the boundary: `STT_API_KEY` is read in exactly one
module, no client component imports `@/lib/stt`, and the **built** client bundle
is scanned for every STT variable name and for the endpoint path.

### Does audio leave Radiora?

**Entirely determined by `STT_BASE_URL`, and stated plainly rather than
implied.** Self-hosted endpoint → audio stays on the operator's infrastructure.
Hosted endpoint → it does not, and that provider's terms govern it.

What is sent, in full: **the audio bytes, a language hint, and — only if
configured — a bounded radiology vocabulary hint.** Not sent: report id, clinic
id, patient id, patient name, accession number, exam type, previous findings,
previous conclusions, or any part of the report. A test reads the outgoing
`FormData` and asserts each of those is absent.

### Phone flow

```
record → upload (R2.7, unchanged) → recording received
      → transcription claimed → provider → RAW transcript persisted
      → canonical transcript → runStructuring → structured proposal → review
```

Transcription is triggered from the **desktop** when the recording lands, not
from the phone. The phone's request stays short and its session is never held
open across a long provider call, and the long operation runs where the page's
`maxDuration` budget applies.

### Imported-audio flow

Identical, and deliberately so. `importReportAudio` attaches the file, then the
same `transcribeReportAudio` runs. There is no `transcribeImportedAudio` and no
`transcribeMobileAudio`: one service, one pipeline. Clinical behaviour does not
depend on which microphone was used.

### Workstation flow — unchanged

Web Speech text still goes straight to structuring without a round trip through
the provider. **Convergence is on TEXT, not audio.**

### Raw transcript is provenance

The provider's transcript is written to `transcription_runs.raw_text`
**verbatim** — before cleanup, before correction resolution, before section
routing, and without trimming or normalising. Only afterwards is the canonical
transcript updated and the existing pipeline invoked. A test asserts the
ordering and that the service imports none of `cleanupFrench`,
`detectSelfCorrections`, `runStructuring`, `parseStructuredText` or
`routeTranscript`.

The radiologist can therefore always distinguish *what the microphone heard*
from *what Radiora structured*.

### Lifecycle and migration 045

`transcriptions.status` is a **review** state (`draft` /
`secretary_reviewed` / `radiologist_reviewed`) — a human workflow, not a job
state; overloading it would corrupt an existing meaning. `audio_assets.status`
has no in-progress and no failed state, and extending a Postgres enum is not
cleanly transaction-safe. There was also no column anywhere that could carry a
compare-and-set. A migration was therefore genuinely required.

**Migration 045** adds one append-only table, `transcription_runs`. Nothing in
001–044 is dropped, altered or re-typed, and no existing row is modified. Status
is `text` + `CHECK` rather than an enum so a future state can be added inside an
ordinary transaction.

| stage | meaning |
|---|---|
| `none` | no recording attached |
| `pending` | audio attached, not started |
| `transcribing` | a worker owns it |
| `completed` | text is part of the canonical transcript |
| `failed` | explicit retry offered |

### Idempotency — the claim

Serverless means the same operation can be invoked twice: a double click, a
retry, a platform re-invocation. The claim is a **partial unique index**:

```sql
CREATE UNIQUE INDEX transcription_runs_active_uidx
  ON transcription_runs (audio_asset_id)
  WHERE status IN ('processing', 'completed');
```

An index makes the race impossible rather than merely unlikely. Both workers
INSERT; Postgres lets exactly one succeed; the loser gets `23505`, returns
`already_processing`, and **never calls the provider** — no double spend, no
duplicate transcript, no duplicate audit entry. The provider configuration is
checked *before* the claim so a misconfigured deployment cannot leave stuck
`processing` rows.

A **completed** run is inside the index, so a finished transcript can never be
silently redone. A **failed** run is outside it, so an explicit retry always
works — on the same audio asset, with no re-recording.

### Long audio and platform limits

`export const maxDuration = 300` is declared on the report page, which is how
Next.js applies a budget to the Server Actions a page hosts. This is a
**ceiling, not a guarantee**: it is only honoured on plans that permit it. A
recording long enough to outlast it fails with the `timeout` category and an
explicit retry rather than a hung request.

`STT_TIMEOUT_MS` (default 120 s) bounds the provider call independently, and the
existing 100 MB audio ceiling is unchanged. **No transcoding was introduced** —
the recorded container is sent as-is — and no media-processing dependency was
added; a test asserts none crept in.

### Multiple dictation passes

Each pass keeps its own audio asset and its own `transcription_runs` row, so
per-pass provenance survives including for failures. The canonical transcript is
the completed passes **appended in order**, separated by a blank line; earlier
text is never destroyed and audio files are never merged. The combined text is
then structured as ONE complete transcript, which is exactly what R2.5/R2.6
expect. An exactly-repeated pass is not appended twice.

### Radiologist control

Unchanged. Automatic transcription is not automatic clinical acceptance: R2.5's
classification, R2.6's provenance and duplication rules, physician-owned section
locks, review-required flags for inferred conclusions and auto-filled technique
— all still apply, and all are re-tested against a transcript that arrived from
the provider. STT cannot sign, finalize or validate; a test asserts the service
contains no signing symbol and writes no report column.

### Failure model

Every raw failure is mapped to a safe internal category before it can reach the
UI: `not_configured`, `auth`, `unavailable`, `timeout`, `rate_limited`,
`unsupported_audio`, `empty_audio`, `too_large`, `empty_transcript`,
`malformed_response`, `unknown`. The provider's response body is never read into
an error, so it cannot surface in the interface or the audit trail. An empty
transcript is a failure, not an empty report — silence never becomes content.

### Audit

`transcription.started` / `.completed` / `.failed` / `.retried`, carrying report
id, run id, provider, model, MIME, byte size, processing duration and — for
completion — the transcript **length**. Never the transcript, the audio, a
storage path, a signed URL, a capability token or the API key. A test extracts
every `logAudit` payload by brace matching and asserts it.

### Known limitations

- **Transcription is synchronous.** It runs inside the request that starts it.
  There is no background queue: a recording that outlasts the platform budget
  fails with `timeout` and must be retried. Adding a queue was out of scope and
  would not have been the smallest reliable mechanism for typical dictations.
- **No streaming.** Uploaded audio is a completed recording; partial provider
  streaming was not implemented and is not claimed.
- **Vocabulary hints are supported by the contract but not yet populated.** The
  adapter forwards a bounded hint when given one; nothing feeds it today, and
  Radiora's vocabulary-learning data is deliberately not wired in until the
  privacy review of what may be sent is done.
- **Provider accuracy on French radiology dictation is unverified here.** No
  provider is configured in this environment, so no accuracy claim is made. The
  downstream safety rules (decimals, negation, laterality, hedging) are tested
  against the pipeline, not against a provider's real output.
- The operator must apply migration 045 and choose an endpoint before the
  feature does anything.
