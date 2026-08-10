import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  appendTranscriptPass,
  transcriptionStage,
  canRetryTranscription,
  isTranscriptionBusy,
} from '@/lib/dictation/transcription-state'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import { createCoordinator, beginRevision, reconcile, liveSections, markPhysicianEdit } from '@/lib/reports/live-coordinator'

// R2.7A — the transcription service's guarantees.
//
// The service talks to Supabase and a provider, so its ordering and ownership
// rules are asserted at their source rather than against a database mocked into
// agreeing with itself. The clinical outcomes are exercised for real.

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const SERVICE = read('lib/actions/transcription.ts')
const CODE    = strip(SERVICE)
const MIGRATION = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/045_transcription_runs.sql', import.meta.url)),
  'utf8',
)

describe('9-12. ownership is proven before anything is transcribed', () => {
  it('the report, the clinic and the asset are all verified', () => {
    expect(CODE).toContain("from('reports')")
    expect(CODE).toMatch(/asset\.clinic_id as string\) !== clinicId/)
    expect(CODE).toMatch(/asset\.report_id as string\) !== reportId/)
  })

  it('12. a finalized report is refused', () => {
    expect(CODE).toContain('isReportContentLocked(report.status as string)')
    expect(CODE.indexOf('isReportContentLocked')).toBeLessThan(CODE.indexOf("from('transcription_runs')"))
  })

  it('nothing about ownership comes from the browser', () => {
    // Only the report id is accepted, and RLS must still agree the caller sees it.
    expect(CODE).not.toMatch(/function transcribeReportAudio\([^)]*clinicId/)
    expect(CODE).not.toMatch(/function transcribeReportAudio\([^)]*assetId/)
    expect(CODE).toContain('const clinicId = report.clinic_id as string')
  })

  it('the private bucket is read server-side, never made public', () => {
    expect(CODE).toContain('.from(AUDIO_BUCKET)')
    expect(CODE).toContain('.download(storagePath)')
    for (const forbidden of ['createSignedUrl', 'getPublicUrl', 'public: true']) {
      expect(CODE, forbidden).not.toContain(forbidden)
    }
  })

  it('8. empty audio is rejected before any provider call', () => {
    expect(CODE.indexOf("code: 'empty_audio'")).toBeLessThan(CODE.indexOf('provider.transcribe'))
  })
})

describe('13-16. the claim makes duplication impossible', () => {
  it('the claim is a partial unique index, not an optimistic update', () => {
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX IF NOT EXISTS transcription_runs_active_uidx')
    expect(MIGRATION).toMatch(/WHERE status IN \('processing', 'completed'\)/)
  })

  it('16. a losing claim returns without calling the provider', () => {
    const claim = CODE.indexOf('const { data: claimed')
    const call  = CODE.indexOf('provider.transcribe')
    expect(claim).toBeGreaterThan(-1)
    expect(claim).toBeLessThan(call)
    expect(CODE).toContain("claimError.code === UNIQUE_VIOLATION")
    // The unique-violation branch returns; it never falls through to the call.
    const loser = CODE.slice(CODE.indexOf('if (claimError.code === UNIQUE_VIOLATION)'))
    expect(loser.slice(0, 300)).toContain("code: 'already_processing'")
  })

  it('an unconfigured provider is detected BEFORE the claim', () => {
    // Otherwise a misconfigured deployment would leave stuck `processing` rows.
    expect(CODE.indexOf('getSttSettings()')).toBeLessThan(CODE.indexOf('const { data: claimed'))
  })

  it('25. a completed run keeps holding the claim', () => {
    // 'completed' is inside the partial index, so a finished transcript can
    // never be silently redone.
    expect(MIGRATION).toMatch(/WHERE status IN \('processing', 'completed'\)/)
  })

  it('24. a failed run releases it, so an explicit retry works', () => {
    expect(MIGRATION).not.toMatch(/WHERE status IN \([^)]*'failed'/)
    expect(CODE).toContain('export async function retryReportTranscription')
    expect(CODE).toContain('return transcribeReportAudio(reportId)')
  })
})

describe('17-19. raw text is provenance', () => {
  it('the provider transcript is persisted before anything derived from it', () => {
    // The run row records the provider's words verbatim; only afterwards is the
    // canonical transcript updated. Compare against the transcriptions WRITE,
    // not the read that resolves the row at the top of the action.
    const persistRun   = CODE.indexOf('raw_text: text')
    const persistCanon = CODE.indexOf('raw_text: canonical')
    expect(persistRun).toBeGreaterThan(-1)
    expect(persistCanon).toBeGreaterThan(-1)
    expect(persistRun).toBeLessThan(persistCanon)
  })

  it('19. the service performs NO clinical processing itself', () => {
    for (const downstream of [
      'cleanupFrench', 'detectSelfCorrections', 'runStructuring',
      'parseStructuredText', 'routeTranscript', 'buildHpdDraft',
    ]) {
      expect(CODE, downstream).not.toContain(downstream)
    }
  })

  it('the raw transcript is stored verbatim, not reformatted', () => {
    // `text` goes to raw_text untouched — no trim, no replace, no normalisation
    // between the provider result and the insert.
    expect(CODE).toMatch(/raw_text:\s*text,/)
    expect(CODE).not.toMatch(/raw_text:\s*text\.(replace|toLowerCase|normalize)/)
  })
})

describe('45-46. multiple dictation passes', () => {
  it('a second pass is appended, never overwritten', () => {
    const first  = 'Le foie est de taille normale.'
    const second = 'Pas de lésion splénique.'
    const combined = appendTranscriptPass(first, second)
    expect(combined).toContain(first)
    expect(combined).toContain(second)
    expect(combined.indexOf(first)).toBeLessThan(combined.indexOf(second))
  })

  it('a re-delivered identical pass does not double the findings', () => {
    const text = 'Nodule hépatique de 12 mm.'
    expect(appendTranscriptPass(text, text)).toBe(text)
    expect(appendTranscriptPass('A. B.', 'B.')).toBe('A. B.')
  })

  it('an empty pass changes nothing', () => {
    expect(appendTranscriptPass('Foie normal.', '')).toBe('Foie normal.')
    expect(appendTranscriptPass('', 'Foie normal.')).toBe('Foie normal.')
  })

  it('46. each pass keeps its own run row and its own audio asset', () => {
    expect(MIGRATION).toContain('audio_asset_id   uuid NOT NULL')
    expect(MIGRATION).toContain('raw_text         text NOT NULL DEFAULT')
    // Append-only: a retry inserts, it does not mutate history.
    expect(CODE).toContain("from('transcription_runs')\n    .insert(")
  })

  it('the service appends rather than replacing the canonical transcript', () => {
    expect(CODE).toContain('appendTranscriptPass(')
  })
})

describe('34-41. the transcript enters the ONE canonical pipeline', () => {
  const WORKSPACE = read('app/[locale]/(dashboard)/reports/[id]/DictationWorkspace.tsx')

  it('34. a completed transcript is handed to the complete-transcript path', () => {
    expect(WORKSPACE).toContain("onStableRef.current?.(res.transcript, { final: true })")
    expect(WORKSPACE).toContain("send({ type: 'TRANSCRIPT_READY' })")
  })

  it('42-43. neither phone nor import requires a typed transcript', () => {
    // The phone path fires from the poll, so it calls through a ref — depending
    // on the function itself would restart the interval on every render.
    expect(WORKSPACE).toMatch(/if \(next === 'received'\)[\s\S]{0,260}transcribeRef\.current\(\)/)
    expect(WORKSPACE).toMatch(/transcribeRef\.current = runTranscription/)
    expect(WORKSPACE).toMatch(/importReportAudio\(reportId, fd\)[\s\S]{0,300}runTranscription\(\)/)
  })

  it('44. the workstation path still bypasses server STT entirely', () => {
    // Convergence is on TEXT, not audio: Web Speech text goes straight to the
    // structuring path without a round trip through the provider.
    expect(WORKSPACE).toContain('useSpeechRecognition')
    expect(WORKSPACE).not.toMatch(/stopComputer[\s\S]{0,600}transcribeReportAudio/)
  })

  it('36-40. structuring behaviour is identical whatever the microphone was', () => {
    const spoken =
      'Indication : céphalées. Petite hyperdensité frontale droite de 12,5 mm. ' +
      'Pas d’hémorragie. Au total, contusion frontale droite.'
    const draft = buildHpdDraft({ rawTranscript: spoken, modality: 'CT', bodyPart: 'cerveau' })

    // R2.6 routing, verbatim content, provenance — all unchanged.
    expect(draft.output.indication).toContain('céphalées')
    expect(draft.output.results).toContain('12,5 mm')
    expect(draft.output.results).toContain('Pas d’hémorragie')
    expect(draft.output.conclusion).toContain('contusion frontale droite')
    expect(draft.structuring.provenance.indication).toBe('explicit_header')
    // 40. The protocol template is still flagged.
    expect(draft.structuring.confidence.find((c) => c.section === 'technique')?.autoFilled).toBe(true)
  })

  it('41. a physician-owned section is still never overwritten', () => {
    const spoken = 'Résultats : petite hyperdensité frontale droite.'
    let c = createCoordinator()
    const begun = beginRevision(c, spoken)
    const d = buildHpdDraft({ rawTranscript: spoken, modality: 'CT', bodyPart: 'cerveau' })
    c = reconcile(begun.state, {
      revision: begun.revision, stableTranscript: spoken, draft: d.output, meta: d.structuring,
    }).state
    c = markPhysicianEdit(c, 'results', 'TEXTE DU RADIOLOGUE')

    const more = `${spoken} Pas d’effet de masse.`
    const b2 = beginRevision(c, more)
    const d2 = buildHpdDraft({ rawTranscript: more, modality: 'CT', bodyPart: 'cerveau' })
    c = reconcile(b2.state, {
      revision: b2.revision, stableTranscript: more, draft: d2.output, meta: d2.structuring,
    }).state

    expect(liveSections(c).results).toBe('TEXTE DU RADIOLOGUE')
    expect(c.suggestions.results).toBeDefined()
  })
})

describe('48-50. audit records operations, never content', () => {
  it('no audit payload carries a transcript, a URL or a token', () => {
    const audits = [...CODE.matchAll(/logAudit\(\{[\s\S]*?\}\)/g)].map((m) => m[0])
    expect(audits.length).toBeGreaterThanOrEqual(4)
    for (const a of audits) {
      // Values, not names: `transcriptLength: text.length` is exactly the
      // shape we want, so the check targets the transcript being PASSED.
      for (const forbidden of [
        'raw_text', 'storagePath', 'storage_path', 'signedUrl',
        'apiKey', 'STT_API_KEY', 'token', 'patient', 'canonical',
      ]) {
        expect(a, forbidden).not.toContain(forbidden)
      }
      expect(a, 'bare transcript').not.toMatch(/[:{,]\s*text\s*[,}]/)
      expect(a, 'transcript field').not.toMatch(/transcript:\s/)
    }
  })

  it('completion records a LENGTH, not the words', () => {
    const completed = CODE.slice(CODE.indexOf("action: 'transcription.completed'"))
    expect(completed).toContain('transcriptLength: text.length')
    expect(completed).not.toMatch(/text,\s*$/m)
  })

  it('failures record a category, never a provider body', () => {
    expect(CODE).toContain('failureCategory: code')
    expect(CODE).not.toContain('await response.text()')
  })

  it('all four lifecycle events exist', () => {
    for (const action of ['started', 'completed', 'failed', 'retried']) {
      expect(CODE, action).toContain(`action: 'transcription.${action}'`)
    }
  })
})

describe('55. speech-to-text has no clinical authority', () => {
  it('the service cannot sign, finalize or validate', () => {
    for (const forbidden of [
      'finalizeReport', 'signReport', 'canSignReports', 'signed_at',
      "status: 'finalized'", 'acceptHPDDraft',
    ]) {
      expect(CODE, forbidden).not.toContain(forbidden)
    }
  })

  it('it writes only the transcript, never a report section', () => {
    for (const forbidden of ['structured_data', 'findings:', 'impression:', 'conclusion:']) {
      expect(CODE, forbidden).not.toContain(forbidden)
    }
  })

  it('the only report column it touches is none at all', () => {
    expect(CODE).not.toMatch(/from\('reports'\)[\s\S]{0,120}\.update\(/)
  })
})

describe('the lifecycle vocabulary', () => {
  it('maps run status onto what the doctor sees', () => {
    expect(transcriptionStage('processing')).toBe('transcribing')
    expect(transcriptionStage('completed')).toBe('completed')
    expect(transcriptionStage('failed')).toBe('failed')
    expect(transcriptionStage(null)).toBe('pending')
    expect(transcriptionStage('something-else')).toBe('pending')
  })

  it('only a failure offers a retry', () => {
    expect(canRetryTranscription('failed')).toBe(true)
    for (const s of ['none', 'pending', 'transcribing', 'completed'] as const) {
      expect(canRetryTranscription(s), s).toBe(false)
    }
  })

  it('only transcribing is busy', () => {
    expect(isTranscriptionBusy('transcribing')).toBe(true)
    expect(isTranscriptionBusy('completed')).toBe(false)
  })
})
