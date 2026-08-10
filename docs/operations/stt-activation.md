# Speech-to-text — activation and operations

**Status: CODE READY. PROVIDER NOT CONFIGURED. NOT E2E VERIFIED.**

Automatic transcription is built, tested and deployed, and is **inert** until an
operator configures a provider. Until then Radiora reports it unavailable and
phone/imported audio behaves exactly as it did in R2.7: the recording attaches
to the report and the transcript can be typed.

---

## Architecture

```
WORKSTATION                          PHONE / IMPORT
  browser Web Speech                   private audio asset  (dictation-audio, never public)
        │                                      │
        │                              transcription_runs claim   ← partial unique index (045)
        │                                      │
        │                              STT provider              ← the ONLY external call
        │                                      │
        │                              RAW transcript, verbatim   ← persisted BEFORE anything cleans it
        │                                      │
        └──────────────► canonical transcript ◄┘
                                 │
                        runStructuring          ← one engine, no "mobile AI"
                        section router (R2.6)
                        correction engine
                        duplication safety
                                 │
                        structured proposal
                                 │
                        RADIOLOGIST REVIEW      ← acceptance and signing stay human
```

**Convergence is on TEXT, not audio.** The workstation never round-trips through
the provider; it already has words.

---

## Environment variables

Server-only. None are `NEXT_PUBLIC_`, so Next never inlines them into a browser
bundle — a test scans the built client assets to prove it.

| variable | required | notes |
|---|---|---|
| `STT_PROVIDER` | yes | **must be exactly `openai-compatible`** — the only accepted value |
| `STT_MODEL` | yes | passed through verbatim, e.g. `whisper-1`, `Systran/faster-whisper-large-v3` |
| `STT_BASE_URL` | yes | **must include the API prefix**, e.g. `https://host/v1` |
| `STT_API_KEY` | conditional | required unless `STT_BASE_URL` is `localhost`/`127.0.0.1` |
| `STT_TIMEOUT_MS` | no | integer, 5000–600000, default 120000 |
| `STT_LANGUAGE` | no | default `fr` |

### Why `STT_BASE_URL` must end in `/v1`

The adapter posts to **`{STT_BASE_URL}/audio/transcriptions`** and the
diagnostic probes **`{STT_BASE_URL}/models`**. Both are appended verbatim. Set
`https://host` and requests go to `https://host/audio/transcriptions`, which
OpenAI-compatible servers do not serve. The diagnostic reports this specifically
on a 404.

### Fail-closed rules

- Unset → transcription unavailable; **no mock, no fabricated transcript, ever**.
- `http://` off localhost → rejected (clinical audio must not travel in clear).
- Remote endpoint with no key → rejected, so a misconfiguration cannot post
  audio to an open endpoint.
- Unknown provider, missing model, malformed URL, out-of-range timeout →
  rejected, naming the variable but never its value.

---

## What leaves Radiora

**Determined entirely by `STT_BASE_URL`.** Self-hosted endpoint → the audio
never leaves your network. Hosted endpoint → it does, and that provider's terms
govern it. Radiora makes no claim about any provider's retention, security
posture or regulatory status — that is a contract you hold, not a property of
this code.

Sent, in full:

1. the audio bytes
2. a language hint (`fr`)
3. a bounded vocabulary hint — **not currently populated**

**Not sent:** report id, clinic id, patient id, patient name, accession number,
exam type, previous findings, previous conclusions, or any part of the report.
A test reads the outgoing `FormData` and asserts each is absent.

Stays inside Radiora: the audio asset (private bucket), the transcript, the
report, all identifiers, and every audit record.

---

## Activation

### 1. Database — already done

Migrations 044, 045 and 046 are applied and verified in production. Nothing to
re-run.

### 2. Configure the provider

Add the variables above to the Vercel project (Production scope).

**Vercel does not apply new environment variables to an existing deployment.**
After adding them, redeploy production — otherwise the running deployment still
sees them as unset and the diagnostic will keep reporting `UNCONFIGURED`.

### 3. Confirm with the diagnostic

Signed in as `super_admin`:

```
GET /api/admin/stt-health
```

| state | meaning | next step |
|---|---|---|
| `UNCONFIGURED` | no `STT_*` present | add the variables, redeploy |
| `INVALID_CONFIGURATION` | present but rejected; `detail` names the variable | fix that variable |
| `UNREACHABLE` | valid config, endpoint did not answer usably | see `detail` — credentials, missing `/v1`, or network |
| `REACHABLE` | endpoint answered | proceed to the E2E test |

It sends no audio, transcribes nothing, writes nothing, and returns the endpoint
**host** and whether a key exists — never the key, never the full URL.

### 4. Production E2E test — **must be run by a human**

Use the synthetic script in `src/lib/stt/synthetic-dictation.ts`. It contains no
patient and is safe to read aloud:

1. « Pas d'hémorragie intracrânienne. »
2. « Nodule du lobe supérieur droit mesurant douze virgule cinq millimètres. »
3. « Je corrige, quatorze millimètres. »
4. « Aspect compatible avec une contusion frontale droite. »
5. « Absence d'épanchement pleural. »
6. « Lésion rénale droite. Je corrige, gauche. »

On a **synthetic, unsigned** report: *Mon téléphone* → scan → record → send.

Then confirm:

- [ ] desktop moves to *Enregistrement reçu*, then *Transcription en cours…*
- [ ] transcript appears without anyone typing it
- [ ] **Dictée originale** shows what the microphone heard, separately from the structured report
- [ ] negation survives — "Pas d'hémorragie", "Absence d'épanchement"
- [ ] laterality is corrected to **gauche**, with no "rénale droite" left standing
- [ ] the measurement reads **14 mm**, not 12,5 and not both
- [ ] "compatible avec" is not promoted to a diagnosis
- [ ] exactly **one** `audio_assets` row and **one** completed `transcription_runs` row
- [ ] pressing Send twice creates no second recording
- [ ] the report is **not** signed
- [ ] repeat the whole flow with *Importer un fichier* — identical behaviour

Record the four durations while doing it: upload, STT, structuring, total.
**None are measured yet** — no provider has been configured, and inventing
numbers would be worse than leaving them blank.

---

## Failure behaviour

Every provider failure maps to a safe internal category before it can reach the
interface. A provider response body is never read into an error, so it cannot
surface in the UI or the audit trail.

| situation | user sees | DB state | retry | audio | audit |
|---|---|---|---|---|---|
| not configured | "not configured on this installation" | no run row | after config | kept | none (refused pre-claim) |
| malformed config | same | no run row | after fix | kept | none |
| unreachable / 5xx | "service is unavailable" | run `failed` | yes | kept | `transcription.failed` |
| unauthorized | "rejected this installation's credentials" | run `failed` | after fix | kept | `transcription.failed` |
| timeout | "did not respond in time" | run `failed` | yes | kept | `transcription.failed` |
| rate limited | "busy, try again shortly" | run `failed` | yes | kept | `transcription.failed` |
| 4xx / unsupported audio | "format cannot be transcribed" | run `failed` | not usefully | kept | `transcription.failed` |
| oversized | "too long for the service" | run `failed` | no | kept | `transcription.failed` |
| invalid response | "the transcription failed" | run `failed` | yes | kept | `transcription.failed` |
| **empty transcript** | "no speech was detected" | run `failed` | yes | kept | `transcription.failed` |
| duplicate / concurrent request | nothing; already in progress | **no second row** | n/a | kept | none |
| completed, requested again | nothing | claim still held | refused | kept | none |
| browser refresh mid-run | stage re-read from the DB | unchanged | yes if failed | kept | none |
| cancelled QR session | session cancelled | audio may already exist | n/a | kept | session audit |
| upload ok, STT fails | transcription failed + **Retry** | asset kept, run `failed` | yes, same audio | kept | `transcription.failed` |
| STT ok, structuring fails | transcript present, structuring error | run `completed` | structure again | kept | completion audited |

Two invariants hold across every row: **no failure invents transcript text**,
and **no failure marks a transcription completed**.

Audio is never deleted by a transcription failure — a retry must not require
re-recording.

---

## Rollback / disable

Remove `STT_PROVIDER` (or any required variable) and redeploy. Transcription
returns to unavailable; phone and imported audio still attach to the report and
the transcript can be typed. **No migration needs reverting** — 045 and 046 are
additive and harmless when unused, and completed transcripts stay readable.

---

## Known limitations

- **Synchronous.** Transcription runs inside the request that starts it. There
  is no background queue: a recording that outlasts the platform budget fails
  with `timeout` and must be retried. `maxDuration = 300` is declared on the
  report page — a ceiling, honoured only on plans that permit it.
- **No streaming.** Uploaded audio is a completed recording.
- **Vocabulary hints unused.** The adapter forwards a bounded hint when given
  one; nothing populates it, pending a privacy review of what may be sent.
- **No provider accuracy claim.** None has been measured. The safety rules are
  tested against the pipeline, not against a provider's real output.
- **No performance figures.** Pending a configured endpoint.
- The diagnostic's model check is advisory: some servers do not enumerate models.
