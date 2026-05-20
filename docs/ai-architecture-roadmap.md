# Radiora Medical — AI Architecture Roadmap

**Status:** Planning document. No AI provider calls are implemented in the current codebase.  
**Last updated:** 2026-05-20  
**Scope:** Phase 4 — AI Architecture, Database Roadmap, and UI Roadmap  

---

## Table of Contents

1. [AI Principles for Radiora](#1-ai-principles-for-radiora)
2. [Human-in-the-Loop Safety Model](#2-human-in-the-loop-safety-model)
3. [Capability Roadmap Overview](#3-capability-roadmap-overview)
4. [Current Schema Reference](#4-current-schema-reference)
5. [Proposed Future Database Tables](#5-proposed-future-database-tables)
6. [AI Workflow Stages](#6-ai-workflow-stages)
7. [Provider-Agnostic Design](#7-provider-agnostic-design)
8. [Role Permissions Model](#8-role-permissions-model)
9. [Audit and Event Model](#9-audit-and-event-model)
10. [Failure States and Resilience](#10-failure-states-and-resilience)
11. [Security and Privacy Principles](#11-security-and-privacy-principles)
12. [UI Component Roadmap](#12-ui-component-roadmap)
13. [Phased Implementation Plan](#13-phased-implementation-plan)
14. [Risk Notes](#14-risk-notes)

---

## 1. AI Principles for Radiora

These principles apply to every AI feature, regardless of provider, modality, or capability:

### 1.1 AI assists; clinicians decide

AI in Radiora is a productivity tool, not a diagnostic system. Every AI output must be explicitly reviewed, accepted or rejected, and finalized by a licensed clinician before it affects any patient record. The AI cannot finalize, sign, or release any report independently.

### 1.2 Transparency over magic

Every AI-produced text must be clearly labeled as AI-generated in the UI and in the database. When a radiologist accepts an AI suggestion, the report version history records that a suggestion was applied. The chain of custody from AI output → human review → finalized report must be fully traceable.

### 1.3 Minimal footprint

AI components access only the data required for the specific task. Voice transcripts, translations, patient explanations, and AI drafts are each stored in separate tables — not embedded in the clinical report unless explicitly accepted by the clinician.

### 1.4 Fail safe, not fail open

If an AI job fails, times out, or returns an unusable output, the clinical workflow continues uninterrupted. AI features degrade gracefully to no-AI behavior. The primary report editor always remains functional without any AI dependency.

### 1.5 Modality and jurisdiction awareness

AI text generation must be aware of the imaging modality, body part, and clinical context. Translation features must distinguish between clinical reports (professional medical language) and patient explanations (plain language). Jurisdiction-specific medical terminology and regulatory requirements (e.g., EN/FR bilingual Canadian clinical communication) must be configurable per clinic.

---

## 2. Human-in-the-Loop Safety Model

```
AI generates suggestion
        │
        ▼
[ai_jobs] job created (status: pending → processing)
        │
        ▼
[ai_outputs] raw model response stored
        │
        ▼
Clinician is notified: "AI draft ready for review"
        │
   ┌────┴────┐
   │         │
Accept     Reject
   │         │
   ▼         ▼
Applied to  Discarded
report      (output retained
fields      for audit)
(creates    [ai_reviews]
version     logged
snapshot)
   │
   ▼
Clinician edits, reviews,
and manually finalizes report
```

**Non-negotiable constraints enforced in application code:**

- `ai_suggestions.status` can only advance to `accepted` after a clinician explicitly acts — never automatically.
- Accepting a suggestion writes a `report_versions` snapshot *before* applying the AI text to the report fields, so the pre-AI state is always recoverable.
- Report finalization is always a separate, explicit clinician action — no AI path can trigger `reports.status = 'finalized'`.
- All AI review decisions are recorded in `ai_reviews` and mirrored to `audit_logs`.

---

## 3. Capability Roadmap Overview

| Phase | Capability | Input | Output | Complexity |
|---|---|---|---|---|
| 4A | Smart Structuring | Typed free text / notes | Structured report fields | Low |
| 4B | Patient Explanation | Finalized clinical report | Plain-language summary | Low |
| 4C | Medical Translation | Finalized report or explanation | Translated text (EN ↔ FR) | Medium |
| 4D | Voice Recognition | Audio dictation | Transcript → structured fields | High |
| 4E | External AI Import | DICOM SR / external API | Classifications, findings, confidence | High |

---

## 4. Current Schema Reference

Tables that AI features will interact with or extend:

### `reports`
```
id, clinic_id, study_id, patient_id, author_id,
status (draft|in_review|finalized|amended),
findings, impression, recommendations,
ai_draft,          ← currently unused; reserved for AI-populated draft
signed_at, created_at, updated_at
```
> **Note:** `ai_draft` exists as a scratchpad column. For Phase 4A, we will populate it but never copy it to `findings`/`impression` without explicit clinician acceptance.

### `report_versions`
```
id, report_id, clinic_id, version_number,
findings, impression, recommendations,
status, created_by, created_at, change_reason
```
> Every AI suggestion acceptance must create a version snapshot first.

### `ai_suggestions` (Phase 3 placeholder)
```
id, clinic_id, study_id, report_id,
status (pending|generated|accepted|rejected|failed),
suggestion_type (draft_report|impression|quality_check),
input_context (jsonb), output_text,
model_name, created_by, created_at,
reviewed_by, reviewed_at
```
> This table is too simple for production AI. Phase 4 replaces it with the `ai_jobs` / `ai_outputs` / `ai_reviews` triad described below.

### `audit_logs`
```
id, clinic_id, user_id, action, entity_type, entity_id,
metadata (jsonb), created_at
```
> All AI actions (suggestion generated, accepted, rejected) will be logged here with `entity_type = 'ai'`.

### `studies`
```
id, clinic_id, patient_id, accession_number,
modality (CT|MRI|XR|US|NM|PT|MG|DX|CR),
body_part, description, study_date,
referring_physician, priority, status, has_report
```
> `modality` and `body_part` are the primary context signals for AI prompt construction.

### `report_templates`
```
id, clinic_id, title, modality, body_part,
findings_template, impression_template,
recommendations_template, is_active, created_by
```
> Templates inform AI prompts for Smart Structuring (Phase 4A). The AI should be aware of the clinic's own template for the modality/body-part combination.

### `profiles`
```
id, clinic_id, role, first_name, last_name,
specialty, license_number, is_active, email
```
> `specialty` and `role` are relevant for AI personalization. A neuroradiologist's expected report style differs from a general radiologist's.

---

## 5. Proposed Future Database Tables

All tables below are **proposed — no migrations exist yet**. Each table description includes the rationale, key columns, and RLS strategy.

---

### 5.1 `ai_jobs`

**Purpose:** Async job queue for all AI requests. Decouples the UI request from the slow model call.

```sql
create table public.ai_jobs (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics(id) on delete cascade,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  -- What kind of AI work
  job_type        text        not null,
    -- 'structure_text'     Phase 4A: free text → structured fields
    -- 'patient_explain'    Phase 4B: clinical report → plain-language
    -- 'translate'          Phase 4C: text → target language
    -- 'voice_transcribe'   Phase 4D: audio → transcript
    -- 'voice_structure'    Phase 4D: transcript → structured fields
    -- 'import_external'    Phase 4E: DICOM SR / external AI result import

  -- Execution state
  status          text        not null default 'pending',
    -- pending | queued | processing | completed | failed | cancelled

  -- Context references (all nullable depending on job_type)
  study_id        uuid        references public.studies(id) on delete set null,
  report_id       uuid        references public.reports(id) on delete set null,
  template_id     uuid        references public.report_templates(id) on delete set null,

  -- Input payload
  input_context   jsonb       not null default '{}',
    -- For structure_text: { free_text, modality, body_part, specialty }
    -- For translate: { source_lang, target_lang, content_type }
    -- For voice_transcribe: { audio_storage_path, duration_seconds }
    -- For import_external: { source_system, external_id }

  -- Execution metadata
  model_name      text,                  -- e.g. 'claude-opus-4-7', 'whisper-large-v3'
  model_provider  text,                  -- e.g. 'anthropic', 'openai', 'google'
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text,                  -- populated on failure
  retry_count     integer not null default 0,

  -- Idempotency
  idempotency_key text unique            -- prevents duplicate submissions
);
```

**RLS strategy:**
- `SELECT`: own clinic only; super_admin sees all
- `INSERT`: authenticated users in own clinic (server-side only via service role in practice)
- `UPDATE`: server-side only (job runner updates status) — deny from anon client

---

### 5.2 `ai_outputs`

**Purpose:** Stores the raw model response for each job. Separated from `ai_jobs` so output text doesn't inflate the job queue, and so multiple output versions per job (e.g., retries) are possible.

```sql
create table public.ai_outputs (
  id              uuid        primary key default gen_random_uuid(),
  job_id          uuid        not null references public.ai_jobs(id) on delete cascade,
  clinic_id       uuid        references public.clinics(id) on delete cascade,
  created_at      timestamptz not null default now(),

  -- Raw model response
  output_text     text,                  -- primary text output
  output_json     jsonb,                 -- structured output where applicable
    -- For structure_text: { findings, impression, recommendations, technique, indication }
    -- For patient_explain: { summary, disclaimer }
    -- For translate: { translated_text, detected_source_lang }
    -- For voice_transcribe: { raw_transcript, segments: [{start, end, text}] }
    -- For import_external: { classifications, confidence_scores, findings }

  -- Model metadata
  model_name      text,
  model_version   text,
  prompt_tokens   integer,
  completion_tokens integer,
  latency_ms      integer,

  -- Confidence / quality signals (model-reported where available)
  confidence_score numeric(4,3),         -- 0.000–1.000
  quality_flags   jsonb default '[]'     -- e.g. ["low_confidence", "hallucination_risk"]
);
```

**RLS strategy:** Same as `ai_jobs` — own clinic only.

---

### 5.3 `ai_reviews`

**Purpose:** Immutable record of every clinician decision on an AI output (accept, reject, edit-then-accept).

```sql
create table public.ai_reviews (
  id              uuid        primary key default gen_random_uuid(),
  job_id          uuid        not null references public.ai_jobs(id) on delete cascade,
  output_id       uuid        references public.ai_outputs(id) on delete set null,
  clinic_id       uuid        references public.clinics(id) on delete cascade,
  reviewed_by     uuid        references auth.users(id) on delete set null,
  reviewed_at     timestamptz not null default now(),

  -- Decision
  decision        text        not null,
    -- 'accepted'        used as-is
    -- 'accepted_edited' accepted after manual modifications
    -- 'rejected'        discarded without use

  -- What changed between AI output and what was applied (if edited)
  applied_text    text,                  -- final text applied to report (may differ from output)
  edit_summary    text,                  -- brief note about what the clinician changed

  -- Linkage to report versioning
  report_version_id uuid       references public.report_versions(id) on delete set null,
    -- The report_versions row created immediately before applying the AI output.
    -- This ensures the pre-AI state is always recoverable.

  -- Linkage to the report fields affected
  applied_fields  text[],                -- e.g. ['findings', 'impression']

  created_at      timestamptz not null default now()
);
```

**RLS strategy:** `SELECT` own clinic. No `UPDATE` or `DELETE` — this table is append-only.

---

### 5.4 `voice_transcripts`

**Purpose:** Stores raw audio metadata and the resulting transcript from a voice dictation session. Keeps audio reference and transcript separate from the report until explicitly applied.

```sql
create table public.voice_transcripts (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics(id) on delete cascade,
  study_id        uuid        references public.studies(id) on delete set null,
  report_id       uuid        references public.reports(id) on delete set null,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  -- Audio source (never store audio bytes in the DB — reference storage path only)
  audio_storage_path text,               -- Supabase Storage object path
  audio_duration_seconds integer,
  audio_format    text,                  -- e.g. 'webm', 'm4a', 'wav'

  -- Transcription result
  raw_transcript  text,                  -- verbatim ASR output
  corrected_transcript text,             -- after radiologist manual correction
  transcript_segments jsonb default '[]',
    -- [{ start_ms, end_ms, text, speaker, confidence }]

  -- Processing state
  transcription_status text not null default 'pending',
    -- pending | processing | completed | failed

  -- Job linkage
  ai_job_id       uuid        references public.ai_jobs(id) on delete set null,

  -- Applied to report?
  applied_to_report boolean not null default false,
  applied_at      timestamptz
);
```

**RLS strategy:** Own clinic only. `created_by` should match `auth.uid()` for INSERT.

> **Privacy note:** Audio files must be stored in a private Supabase Storage bucket with per-clinic isolation. Audio must be deleted (or access revoked) after transcript is accepted and a configurable retention period passes. The `audio_storage_path` should be cleared after deletion.

---

### 5.5 `report_translations`

**Purpose:** Stores translated versions of a clinical report. Never replaces the source report — always a separate record.

```sql
create table public.report_translations (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics(id) on delete cascade,
  report_id       uuid        not null references public.reports(id) on delete cascade,
  created_by      uuid        references auth.users(id) on delete set null,
  reviewed_by     uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,

  -- Language
  source_language text        not null default 'en',   -- ISO 639-1
  target_language text        not null,                -- e.g. 'fr', 'es', 'ar'

  -- Content (mirrors report fields)
  findings        text,
  impression      text,
  recommendations text,

  -- Source version snapshot (translation is tied to a specific report version)
  source_version_id uuid      references public.report_versions(id) on delete set null,

  -- Review state
  status          text        not null default 'ai_draft',
    -- ai_draft | under_review | approved | rejected

  -- Job linkage
  ai_job_id       uuid        references public.ai_jobs(id) on delete set null,

  unique (report_id, target_language)    -- one translation per language per report
);
```

**RLS strategy:** Own clinic only. `SELECT` available to radiologist, clinic_admin, referring_physician (for their patients' reports). `INSERT/UPDATE` restricted to radiologist and clinic_admin.

> **Critical:** A translation that has not been `approved` by a clinician must never be displayed to a patient or external party. The `status` field must be checked server-side before any translation is surfaced.

---

### 5.6 `patient_explanations`

**Purpose:** Stores a lay-language summary of the clinical report, suitable for sharing with the patient. Explicitly separated from the clinical report so it can be drafted, reviewed, and approved independently.

```sql
create table public.patient_explanations (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics(id) on delete cascade,
  report_id       uuid        not null references public.reports(id) on delete cascade,
  patient_id      uuid        not null references public.patients(id) on delete cascade,
  created_by      uuid        references auth.users(id) on delete set null,
  reviewed_by     uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,

  -- Content
  language        text        not null default 'en',
  summary_text    text        not null,
  disclaimer_text text        not null default
    'This summary has been prepared by your radiologist to help you understand your imaging results. '
    'It is not a substitute for the full medical report. Please discuss the results with your doctor.',

  -- Source version snapshot
  source_version_id uuid      references public.report_versions(id) on delete set null,

  -- Review state
  status          text        not null default 'ai_draft',
    -- ai_draft | under_review | approved | released

  -- Release tracking (when did the clinician authorize sharing with the patient)
  released_at     timestamptz,

  -- Job linkage
  ai_job_id       uuid        references public.ai_jobs(id) on delete set null,

  unique (report_id, language)
);
```

**RLS strategy:** `SELECT` restricted: radiologist + clinic_admin for review; patient access requires a future patient portal role (not yet in schema). `INSERT/UPDATE` by radiologist and clinic_admin only. A `released` explanation may be surfaced to a patient portal — but that endpoint must enforce `status = 'released'` server-side.

---

### 5.7 `external_ai_results`

**Purpose:** Stores AI analysis results imported from external systems (CAD software, third-party AI readers, cloud radiology AI APIs). These are never produced by Radiora's own AI pipeline — they come from outside.

```sql
create table public.external_ai_results (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics(id) on delete cascade,
  study_id        uuid        not null references public.studies(id) on delete cascade,
  created_at      timestamptz not null default now(),
  imported_by     uuid        references auth.users(id) on delete set null,

  -- Source system identification
  source_system   text        not null,   -- e.g. 'aidoc', 'qure.ai', 'annalise', 'custom'
  source_version  text,                   -- external model version
  external_id     text,                   -- ID in the external system

  -- Result payload (normalized)
  result_type     text        not null,
    -- 'classification'    e.g. PE present / absent
    -- 'finding_list'      list of detected findings
    -- 'quantification'    measurements, volumes
    -- 'dicom_sr'          structured report from DICOM SR object

  findings_json   jsonb       not null default '{}',
    -- Normalized representation of findings, classes, confidence scores

  confidence_score numeric(4,3),          -- overall job confidence if available
  raw_payload     jsonb,                  -- original unmodified external payload

  -- Clinician review
  reviewed_by     uuid        references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  review_decision text,
    -- 'accepted' | 'rejected' | 'partially_accepted'
  review_notes    text,

  -- Report linkage (if clinician chose to incorporate into a report)
  incorporated_into_report_id uuid references public.reports(id) on delete set null
);
```

**RLS strategy:** Own clinic only. Import endpoint is server-side only (service role). Radiologist and clinic_admin can read and review.

---

### 5.8 `dicom_imports`

**Purpose:** Tracks DICOM metadata import events — separate from the imaging files themselves. Radiora does not store DICOM pixel data; this table records that a DICOM object was referenced and what metadata was extracted.

```sql
create table public.dicom_imports (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics(id) on delete cascade,
  study_id        uuid        references public.studies(id) on delete set null,
  imported_by     uuid        references auth.users(id) on delete set null,
  imported_at     timestamptz not null default now(),

  -- DICOM identifiers
  study_instance_uid  text,
  series_instance_uid text,
  sop_instance_uid    text,
  sop_class_uid       text,               -- identifies DICOM SR, SC, etc.

  -- Source
  source_system   text,                   -- e.g. 'orthanc', 'dcm4chee', 'vendor_pacs'
  source_ae_title text,                   -- DICOM Application Entity Title

  -- Metadata extracted
  modality        text,
  body_part       text,
  study_date      date,
  series_description text,

  -- Import state
  status          text        not null default 'pending',
    -- pending | processed | failed | ignored

  -- SR result linkage
  external_ai_result_id uuid references public.external_ai_results(id) on delete set null
);
```

---

## 6. AI Workflow Stages

### 6.1 Phase 4A — Smart Structuring (Text → Structured Fields)

**Trigger:** Radiologist clicks "Structure with AI" in the report editor (currently shown as disabled "Generate AI Draft").

**Data flow:**

```
1. User pastes free text / notes / prior report into a staging textarea
2. Server action creates ai_jobs row (job_type='structure_text')
   Input context: { free_text, modality, body_part, specialty, template_id }
3. Background job calls AI provider (server-side only, service role)
   Prompt includes: modality-specific system prompt + clinic template content
4. ai_outputs row created with output_json:
   { findings, impression, recommendations, technique, indication }
5. Job status → 'completed'
6. Report editor polls (or uses Supabase Realtime) for completed job
7. AI Draft panel renders the structured output — CLEARLY LABELED as AI-generated
8. Radiologist reviews each field individually:
   - Accept field → applied to report textarea
   - Edit field → modified text applied
   - Reject field → ignored
9. Clinician acceptance creates ai_reviews row, then creates report_versions snapshot
10. Audit event: ai.suggestion_accepted / ai.suggestion_rejected
```

**AI Draft → report_versions connection:**

```
Before applying any AI field to the report:
  ┌─────────────────────────────────────────────────────┐
  │  createVersion(supabase, {                          │
  │    reportId, clinicId, findings, impression,        │
  │    status: 'draft', createdBy: user.id,             │
  │    changeReason: 'AI suggestion applied'            │
  │  })                                                 │
  └─────────────────────────────────────────────────────┘

Then update the report field(s).
ai_reviews.report_version_id = the pre-AI version id
```

This guarantees the state before AI application is always recoverable.

---

### 6.2 Phase 4B — Patient Explanation

**Trigger:** On a finalized report, clinician clicks "Generate Patient Summary".

**Data flow:**

```
1. Server action creates ai_jobs row (job_type='patient_explain')
   Input context: { report_id, source_language, target_language, reading_level }
2. AI called server-side with the finalized findings + impression
3. ai_outputs row created with output_json:
   { summary_text, disclaimer_text, reading_grade_estimate }
4. patient_explanations row created (status='ai_draft')
5. Clinician reviews in Patient Explanation panel
6. If approved: patient_explanations.status → 'approved'
7. If released to patient portal (future): status → 'released', released_at set
8. Audit event: patient_explanation.generated, patient_explanation.approved
```

**Important:** AI is given only the clinical report content — **not** the patient's name, DOB, MRN, or any identifier — to minimize PHI exposure to the model provider.

---

### 6.3 Phase 4C — Medical Translation

**Trigger:** On a finalized report or patient explanation, clinician requests translation.

**Data flow:**

```
1. Source: finalized report fields OR approved patient_explanations row
2. Server action creates ai_jobs row (job_type='translate')
   Input context: { source_language: 'en', target_language: 'fr', content_type: 'clinical'|'patient' }
3. AI translates findings, impression, recommendations individually
   (Separate fields allow partial re-translation later)
4. report_translations row created (status='ai_draft')
   OR patient_explanations row for target language created
5. Clinician reviews translation in Translation panel
6. If approved: status → 'approved'
7. Audit event: translation.generated, translation.approved
```

**Terminology preservation:** The AI prompt must include instructions to preserve medical acronyms (CT, MRI, etc.), proper nouns (anatomical terms), and dosage values verbatim unless a clinician-approved glossary overrides them.

---

### 6.4 Phase 4D — Voice Recognition

**Trigger:** Radiologist activates voice dictation in the report editor.

**Data flow:**

```
1. Browser captures audio (MediaRecorder API)
   Audio chunks streamed to Supabase Storage (private bucket)
2. voice_transcripts row created (status='pending')
3. Submission: ai_jobs row created (job_type='voice_transcribe')
4. AI transcription provider processes audio
5. voice_transcripts.raw_transcript populated; status → 'completed'
6. Optional: second ai_jobs row (job_type='voice_structure') 
   passes transcript through structuring pipeline (same as Phase 4A)
7. Radiologist reviews transcript in Voice Dictation panel:
   - Corrects transcript errors
   - Accepts structured output or edits manually
8. ai_reviews records the decision
9. Audio file deleted from Storage after configurable retention period
10. Audit event: voice.transcribed, voice.applied
```

**Specialized vocabulary:** The transcription prompt must include radiology-specific vocabulary hints: modality names, anatomical terms, measurement units, common report phrases. Clinics may provide a custom vocabulary list stored in a future `clinic_vocabulary` table.

---

### 6.5 Phase 4E — External AI / DICOM SR Import

**Trigger:** Technician or system imports a DICOM SR object or external AI result via API.

**Data flow:**

```
1. DICOM SR or external AI result arrives (webhook or upload)
2. dicom_imports row created (source system, UIDs, metadata)
3. Parser normalizes findings to external_ai_results.findings_json
4. Study is linked; study status may advance to 'in_review'
5. Radiologist is notified: "External AI result available"
6. Radiologist reviews findings in External AI Results panel:
   - Accept: findings incorporated into report draft
   - Partially accept: select specific findings
   - Reject: result ignored (retained for audit)
7. review_decision recorded in external_ai_results
8. Audit event: external_ai.imported, external_ai.accepted, external_ai.rejected
```

---

## 7. Provider-Agnostic Design

All AI provider calls must be isolated behind an abstraction layer so that providers can be changed without modifying application logic.

### 7.1 Proposed abstraction interface

```typescript
// src/lib/ai/provider.ts

interface AIProvider {
  name: string
  version: string

  structureText(input: StructureTextInput): Promise<StructureTextOutput>
  explainForPatient(input: ExplainInput): Promise<ExplainOutput>
  translateText(input: TranslateInput): Promise<TranslateOutput>
  transcribeAudio(input: TranscribeInput): Promise<TranscribeOutput>
}

// Concrete implementations (none yet):
// class AnthropicProvider implements AIProvider { ... }
// class OpenAIProvider implements AIProvider { ... }
// class GoogleProvider implements AIProvider { ... }
// class MockProvider implements AIProvider { ... }  ← for testing
```

### 7.2 Configuration

Provider selection should be per-capability and configurable per clinic in future:

```
RADIORA_AI_PROVIDER_STRUCTURE=anthropic          # Phase 4A
RADIORA_AI_PROVIDER_EXPLAIN=anthropic            # Phase 4B
RADIORA_AI_PROVIDER_TRANSLATE=google             # Phase 4C (DeepL/Google better for translation)
RADIORA_AI_PROVIDER_TRANSCRIBE=openai            # Phase 4D (Whisper)
```

Provider config lives in environment variables — never in the database, never client-accessible.

### 7.3 Current recommended providers (at time of writing)

| Capability | Recommended Provider | Model | Notes |
|---|---|---|---|
| Smart Structuring | Anthropic | claude-opus-4-7 | Best at following structured output instructions |
| Patient Explanation | Anthropic | claude-sonnet-4-6 | Cost-efficient for simpler summarization |
| Translation | DeepL or Google Translate | — | Specialized translation models outperform general LLMs |
| Voice Transcription | OpenAI | whisper-large-v3 | Best medical vocabulary coverage |
| DICOM SR parsing | Internal / open-source | — | `dcmjs` or `pydicom` for normalization |

Providers are subject to change as capabilities evolve. The abstraction layer must be implemented before any provider is wired up.

---

## 8. Role Permissions Model

| Role | Request AI job | Review AI output | Approve translation | Approve patient explanation | Import external AI |
|---|---|---|---|---|---|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| clinic_admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| radiologist | ✓ | ✓ | ✓ (own reports) | ✓ (own reports) | ✓ |
| technician | — | — | — | — | ✓ (import only) |
| referring_physician | — | read-only view | — | — | — |
| viewer | — | — | — | — | — |

**RLS note:** Role enforcement must be double-checked at the server action level — not trusted from client input. The `profiles.role` for `auth.uid()` is the authoritative source.

---

## 9. Audit and Event Model

All AI events are appended to the existing `audit_logs` table using the consistent `action` / `entity_type` / `entity_id` / `metadata` structure.

### 9.1 Planned AI audit events

| Action | entity_type | Description |
|---|---|---|
| `ai.job_created` | `ai_job` | Job submitted by user |
| `ai.job_completed` | `ai_job` | Model returned output |
| `ai.job_failed` | `ai_job` | Job failed after retries |
| `ai.suggestion_accepted` | `ai_review` | Clinician accepted output |
| `ai.suggestion_accepted_edited` | `ai_review` | Accepted with modifications |
| `ai.suggestion_rejected` | `ai_review` | Clinician rejected output |
| `voice.transcribed` | `voice_transcript` | Transcription completed |
| `voice.applied` | `voice_transcript` | Transcript applied to report |
| `translation.generated` | `report_translation` | Translation AI draft ready |
| `translation.approved` | `report_translation` | Clinician approved |
| `patient_explanation.generated` | `patient_explanation` | Draft ready |
| `patient_explanation.approved` | `patient_explanation` | Clinician approved |
| `patient_explanation.released` | `patient_explanation` | Released to patient |
| `external_ai.imported` | `external_ai_result` | External result received |
| `external_ai.accepted` | `external_ai_result` | Radiologist accepted |
| `external_ai.rejected` | `external_ai_result` | Radiologist rejected |

### 9.2 Metadata schema per event

```json
// ai.suggestion_accepted
{
  "job_id": "...",
  "output_id": "...",
  "applied_fields": ["findings", "impression"],
  "model_name": "claude-opus-4-7",
  "pre_ai_version_id": "..."   // report_versions row created before applying
}

// ai.job_failed
{
  "job_id": "...",
  "job_type": "structure_text",
  "error_code": "provider_timeout",
  "retry_count": 3
}
```

---

## 10. Failure States and Resilience

### 10.1 Job failure

If an AI job fails (network timeout, provider error, rate limit, content policy refusal):

1. `ai_jobs.status` → `'failed'`, `error_message` populated
2. The report editor displays a non-blocking error: "AI Draft unavailable. You can continue editing manually."
3. The primary report editor remains fully functional
4. Failed jobs are retained for 90 days for debugging
5. Optional: automatic retry (max 3 attempts with exponential backoff) for transient errors

### 10.2 Partial output

If the model returns a partial response (e.g., only findings, missing impression):

- Accept only the fields present; leave others as-is
- `ai_outputs.quality_flags` includes `"partial_output"`
- UI displays per-field availability status

### 10.3 Content policy refusal

If the provider refuses to process the input (e.g., content policy):

- `ai_jobs.status` → `'failed'`, `error_message` = provider reason
- No output stored
- Audit event logged with reason
- UI message: "AI could not process this content."

### 10.4 Hallucination detection (future)

Phase 4A+: the AI prompt should include instructions to output a `confidence_score` and flag when it is guessing. `ai_outputs.quality_flags` can carry `"hallucination_risk"`. The UI should surface this flag prominently in the review panel.

---

## 11. Security and Privacy Principles

### 11.1 PHI minimization

When calling AI providers, transmit the minimum necessary information:

| Feature | Send to AI | Do NOT send |
|---|---|---|
| Smart Structuring | Free text (de-identified if possible), modality, body part | Patient name, DOB, MRN, referring physician |
| Patient Explanation | Findings + impression text | Patient identifiers |
| Translation | Report text | Patient identifiers |
| Voice Transcription | Audio file | Metadata linking audio to specific patient |

All AI provider calls must be made from server-side functions (Next.js Server Actions or Route Handlers) using environment variables — never from the browser.

### 11.2 API key security

- AI provider keys stored in Vercel environment variables only
- Never committed to the repository
- Never exposed to the client
- Rotated on a schedule (quarterly minimum)
- Separate keys per environment (dev / staging / production)

### 11.3 Data residency

Before enabling AI features for any clinic, confirm that:

- The AI provider processes data in an acceptable region (EU/CA/US as required)
- A Business Associate Agreement (BAA) exists with each provider used for PHI processing
- Patient data is not used for model training (verify in provider's DPA)

### 11.4 Audit completeness

Every AI interaction (job created, output received, clinician decision) must produce an `audit_logs` entry. The audit trail must be sufficient to reconstruct:

- Who requested the AI assistance
- What input was provided
- What the model returned
- What the clinician did with it
- What version of the report existed before and after

### 11.5 Audio data handling

Voice transcripts present elevated PHI risk. Additional controls required:

- Audio stored in private Supabase Storage bucket with per-clinic isolation
- Pre-signed URLs with short TTL (5 minutes) for any playback
- Automatic deletion after transcript is accepted and retention period passes
- `voice_transcripts.audio_storage_path` cleared after file deletion
- Audio never retained after the associated report is finalized

---

## 12. UI Component Roadmap

These panels are placeholders for future implementation. The disabled "Generate AI Draft" button is already present in the report editor.

### 12.1 AI Draft Panel (Phase 4A)

Location: Report editor, below the template selector.

```
┌─────────────────────────────────────────────────────┐
│ ✨ AI Draft                               [Close ×] │
│                                                     │
│ Generated from: free text input                     │
│ Model: claude-opus-4-7  ·  Confidence: 0.92         │
│                                                     │
│ FINDINGS ──────────────────────────── [Apply] [✗]  │
│ The chest X-ray demonstrates...                     │
│                                                     │
│ IMPRESSION ─────────────────────────── [Apply] [✗] │
│ No acute cardiopulmonary process.                   │
│                                                     │
│ RECOMMENDATIONS ───────────────────── [Apply] [✗]  │
│ Clinical correlation recommended.                   │
│                                                     │
│ ⚠ AI-generated content. Clinician review required. │
└─────────────────────────────────────────────────────┘
```

### 12.2 Voice Dictation Panel (Phase 4D)

Location: Report editor, accessible via microphone button.

```
┌─────────────────────────────────────────────────────┐
│ 🎙 Voice Dictation                       [Close ×] │
│                                                     │
│ [● Record]  [■ Stop]  Duration: 0:43               │
│                                                     │
│ TRANSCRIPT ──────────────────────────────────────── │
│ "The chest X-ray demonstrates... clear lung fields  │
│ bilaterally... no pneumothorax..."                  │
│                                                     │
│ [Edit transcript]     [Structure with AI]           │
│                                                     │
│ ⚠ Review transcript before structuring.            │
└─────────────────────────────────────────────────────┘
```

### 12.3 Translation Panel (Phase 4C)

Location: Finalized report view, for clinic_admin / radiologist.

```
┌─────────────────────────────────────────────────────┐
│ 🌐 Translation: French                   [Close ×] │
│ Status: AI Draft — Clinician review required        │
│                                                     │
│ CONSTATATIONS ────────────────────────────────────  │
│ La radiographie du thorax montre...                 │
│                                                     │
│ IMPRESSION ────────────────────────────────────── ─ │
│ Aucun processus cardiopulmonaire aigu.              │
│                                                     │
│ [Edit]  [Approve Translation]  [Reject]             │
└─────────────────────────────────────────────────────┘
```

### 12.4 Patient Explanation Panel (Phase 4B)

Location: Finalized report view, clinic_admin / radiologist only.

```
┌─────────────────────────────────────────────────────┐
│ 👤 Patient Summary                       [Close ×] │
│ Status: AI Draft — Not yet approved                 │
│                                                     │
│ Your chest X-ray looks normal. The radiologist      │
│ did not find any signs of pneumonia, fluid around   │
│ the lungs, or other concerning findings.            │
│                                                     │
│ ────────────────────────────────────────────────── │
│ ℹ This summary is a simplified explanation         │
│   prepared by your radiologist. Please discuss     │
│   the full results with your doctor.               │
│                                                     │
│ [Edit]  [Approve & Release]  [Reject]               │
└─────────────────────────────────────────────────────┘
```

### 12.5 External AI Results Panel (Phase 4E)

Location: Study detail page, for radiologist.

```
┌─────────────────────────────────────────────────────┐
│ 🤖 External AI — Aidoc CT PE Detection   [Close ×] │
│ Source: Aidoc v3.2  ·  Imported: May 20, 2026       │
│                                                     │
│ CLASSIFICATION ───────────────────────────────────  │
│ Pulmonary Embolism: POSITIVE  ·  Confidence: 0.94   │
│                                                     │
│ FINDINGS ──────────────────────────────────────── ─ │
│ • Filling defect in right main pulmonary artery     │
│ • Saddle embolus pattern                            │
│                                                     │
│ ⚠ This is an AI result, not a final diagnosis.    │
│   Radiologist review is required.                   │
│                                                     │
│ [Accept findings]  [Partially accept]  [Reject]     │
└─────────────────────────────────────────────────────┘
```

### 12.6 AI Review History (all phases)

Location: Report detail page, below version history.

Displays a compact timeline of all AI interactions for this report: jobs requested, outputs generated, clinician decisions, fields applied.

---

## 13. Phased Implementation Plan

### Phase 4A — Smart Structuring (recommended first)

**Why first:** Pure text-in / text-out. No audio, no external APIs, no DICOM. Low data-privacy surface. Highest immediate value for radiologists. Validates the full AI job → output → review → version-snapshot pipeline before adding complexity.

**Implementation steps:**
1. Create `ai_jobs`, `ai_outputs`, `ai_reviews` tables + RLS migrations
2. Implement `AIProvider` interface + `AnthropicProvider`
3. Build `POST /api/ai/structure` route handler (server-side only)
4. Build AI Draft panel UI component
5. Wire "Generate AI Draft" button (currently disabled) to the panel
6. Wire acceptance to `ai_reviews` + `report_versions` creation
7. Add audit events

**Estimated complexity:** Medium

---

### Phase 4B — Patient Explanation

**Why second:** Builds directly on Phase 4A infrastructure. Same provider, similar prompt pattern. No new storage requirements. High patient-experience value.

**Implementation steps:**
1. Create `patient_explanations` table + RLS
2. Build `POST /api/ai/explain` route handler
3. Build Patient Explanation panel
4. Add approval workflow + audit

**Estimated complexity:** Low-Medium

---

### Phase 4C — Medical Translation

**Why third:** Introduces a second AI provider (translation-specialized). Requires `report_translations` table. EN/FR bilingual requirement is high-priority for Canadian market.

**Implementation steps:**
1. Create `report_translations` table + RLS
2. Choose and configure translation provider (DeepL API recommended)
3. Implement `TranslationProvider` in the abstraction layer
4. Build Translation panel
5. Ensure `source_version_id` is always set (translation tied to a specific report version)

**Estimated complexity:** Medium

---

### Phase 4D — Voice Recognition

**Why fourth:** Requires browser audio capture, Supabase Storage integration, and a third AI provider (Whisper). Also requires a two-step pipeline (transcribe → structure). Highest implementation complexity in this phase.

**Implementation steps:**
1. Create `voice_transcripts` table + Storage bucket policy
2. Implement browser audio capture (MediaRecorder)
3. Upload audio to Supabase Storage (private bucket, per-clinic path)
4. Build transcription job pipeline (OpenAI Whisper)
5. Build Voice Dictation panel
6. Wire transcript → structure pipeline (reuses Phase 4A structuring)
7. Implement audio retention / deletion policy
8. Add specialized radiology vocabulary injection

**Estimated complexity:** High

---

### Phase 4E — DICOM SR / External AI Import

**Why last:** Requires external system integrations (PACS, vendor AI APIs), DICOM parsing, and the most complex review workflow. Deferred until the core AI infrastructure from 4A–4D is stable.

**Implementation steps:**
1. Create `external_ai_results`, `dicom_imports` tables + RLS
2. Build DICOM SR parser (dcmjs / pydicom sidecar)
3. Build import webhook endpoint (authenticated, clinic-scoped)
4. Build External AI Results panel
5. Wire acceptance to report draft
6. DICOM accession number cross-reference to `studies.accession_number`

**Estimated complexity:** Very High

---

## 14. Risk Notes

### 14.1 No autonomous diagnosis

AI outputs in Radiora are **assistance only**. The system must never:
- Set `reports.status = 'finalized'` without an explicit clinician action
- Display AI output as if it were a clinician-authored finding
- Pass AI text to a patient or external party without clinician approval

All AI-generated text must be clearly and persistently labeled in the UI and in the database.

### 14.2 No AI finalization

The finalize action (`reports.status = 'finalized'`) must always require:
1. A human user session (`auth.uid()` resolves to a real profile)
2. A role check (`radiologist`, `clinic_admin`, or `super_admin`)
3. Non-empty `findings` and `impression`
4. An explicit form submission — no automated path

These checks exist today in `src/lib/actions/reports.ts:finalizeReport()` and must not be bypassed by any AI integration.

### 14.3 Hallucination prevention

Radiology AI is particularly vulnerable to hallucination because the model cannot actually see the images. Mitigations:

- Prompts must specify modality and body part — the model must not invent anatomy
- Prompts must instruct the model to use hedged language ("consider," "cannot exclude") rather than definitive diagnoses
- `ai_outputs.quality_flags` must surface any model-reported uncertainty
- UI must display confidence score and quality flags during review
- Any field with `confidence_score < 0.7` should be highlighted as low-confidence

### 14.4 Source traceability

Every finalized report where AI was used must carry a traceable chain:
- `audit_logs` records the AI job, output, and clinician decision
- `report_versions` records the pre-AI state of every field that was AI-applied
- `ai_reviews.report_version_id` links the acceptance event to the version snapshot

This chain must be producible in response to a medico-legal query.

### 14.5 Auditability

All AI events must be logged in `audit_logs` in real time. Log entries must not be deleted. The audit log must be exportable (future feature) for regulatory reporting.

### 14.6 Data privacy and PHI

- Patient identifiers must not be sent to external AI providers unless a BAA is in place
- De-identification should be applied where possible before external API calls
- Audio files must be deleted after the configurable retention period
- All AI providers must be assessed under the clinic's jurisdiction's privacy law (HIPAA, PIPEDA, GDPR as applicable) before enablement

### 14.7 Provider lock-in

The `AIProvider` interface must be implemented before any provider is wired up. This ensures:
- The provider can be swapped without changing application logic
- Multiple providers can be used simultaneously for different capabilities
- A `MockProvider` can be used in tests without real API calls

Any capability that bypasses the abstraction layer and calls a provider SDK directly must be treated as a critical architectural debt item.

### 14.8 Model deprecation

AI providers retire models on their own schedules. `ai_jobs.model_name` and `ai_outputs.model_name` must always record the exact model used. When a model is deprecated:
- Existing outputs remain readable and auditable
- New jobs must point to the successor model
- Provider configuration change is a deploy-time variable change, not a database migration

---

*This document is a living architecture plan. It should be updated at the start of each Phase 4 sub-phase to reflect implementation decisions, schema changes, and lessons learned.*
