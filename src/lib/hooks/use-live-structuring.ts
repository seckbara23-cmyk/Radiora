'use client'

// R2.5 — React binding for the live structuring coordinator.
//
// This hook ORCHESTRATES; it does not decide. Every clinical judgement lives in
// live-coordinator.ts, which is pure. What is here is the part that cannot be:
// holding the coordinator between renders, running the canonical pipeline, and
// telling the editor which sections were actually written.
//
// The pipeline runs LOCALLY in the browser. `buildHpdDraft` is the exact same
// deterministic module the server action uses — no second engine, no network,
// no external model, so a stable sentence structures in a couple of
// milliseconds and no clinical text leaves the page.
//
// The coordinator lives in a ref, not in state: it is a reducer whose result
// must be read back synchronously inside the same event (to notify the editor),
// and state is only mirrored so React re-renders. No clinical work happens in
// an effect — a settled sentence is an event, and structuring runs on the spot.

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildHpdDraft } from '@/lib/ai/hpd-draft'
import {
  createCoordinator,
  beginRevision,
  reconcile,
  markPhysicianEdit,
  resumeAiManagement,
  acceptSuggestion,
  rejectSuggestion,
  adoptReportData,
  liveSections,
  physicianOwnedSections,
  freeze,
  type LiveCoordinatorState,
  type LiveFlagCode,
  type SectionSuggestion,
} from '@/lib/reports/live-coordinator'
import type { SectionKey, SectionTextMap } from '@/lib/safety/sections'
import type { StructuredReportData } from '@/types/report'

export interface AppliedSection {
  key: SectionKey
  text: string
}

export interface UseLiveStructuringOptions {
  modality: string | null
  bodyPart: string | null
  /** Persisted report content — every non-empty section starts physician-owned. */
  base?: StructuredReportData | null
  /** A finalized report accepts no live activity at all. */
  frozen?: boolean
  /** Sections the coordinator actually wrote. The editor applies them. */
  onApplied: (sections: AppliedSection[]) => void
}

export interface LiveStructuringApi {
  sections: SectionTextMap
  flags: Partial<Record<SectionKey, LiveFlagCode[]>>
  reportFlags: LiveFlagCode[]
  suggestions: Partial<Record<SectionKey, SectionSuggestion>>
  /** Sections the radiologist owns — live AI is paused for these. */
  owned: SectionKey[]
  /** True once at least one revision has been reconciled. */
  active: boolean
  /** Structure a STABLE transcript. Never call this with interim speech. */
  submit: (stableTranscript: string, opts?: { force?: boolean }) => void
  notePhysicianEdit: (key: SectionKey, text: string) => void
  accept: (key: SectionKey) => void
  reject: (key: SectionKey) => void
  resumeAi: (key: SectionKey) => void
  /** Re-baseline from content applied outside the live loop. */
  adopt: (data: StructuredReportData) => void
}

export function useLiveStructuring({
  modality,
  bodyPart,
  base = null,
  frozen = false,
  onApplied,
}: UseLiveStructuringOptions): LiveStructuringApi {
  // Created once. The ref is the authority the callbacks read back within a
  // single event; `coord` is the render mirror.
  const [initial] = useState<LiveCoordinatorState>(() => createCoordinator({ base, frozen }))
  const ref = useRef<LiveCoordinatorState>(initial)
  const [coord, setCoord] = useState<LiveCoordinatorState>(initial)

  const onAppliedRef = useRef(onApplied)
  useEffect(() => { onAppliedRef.current = onApplied })

  const commit = useCallback((next: LiveCoordinatorState) => {
    ref.current = next
    setCoord(next)
  }, [])

  const submit = useCallback(
    (stableTranscript: string, opts?: { force?: boolean }) => {
      // A finalized report accepts nothing. Guarded here as well as inside the
      // coordinator, so a report finalized mid-session stops immediately.
      if (frozen) return
      const prev = freezeIfNeeded(ref.current, frozen)
      const begun = beginRevision(prev, stableTranscript, opts)
      if (!begun.changed) return // unchanged transcript, or frozen — do no work

      const draft = buildHpdDraft({ rawTranscript: stableTranscript, modality, bodyPart })
      const result = reconcile(begun.state, {
        revision: begun.revision,
        stableTranscript,
        draft: draft.output,
        meta: draft.structuring,
      })
      if (result.outcome !== 'applied') {
        // Stale or frozen: keep the revision counter, change nothing clinical.
        commit(begun.state)
        return
      }
      commit(result.state)

      const written = result.decisions
        .filter((d) => d.applied)
        .map((d) => ({ key: d.key, text: d.proposedText }))
      if (written.length > 0) onAppliedRef.current(written)
    },
    [modality, bodyPart, commit, frozen],
  )

  const notePhysicianEdit = useCallback(
    (k: SectionKey, text: string) => commit(markPhysicianEdit(ref.current, k, text)),
    [commit],
  )

  const accept = useCallback((k: SectionKey) => {
    if (frozen) return
    const next = acceptSuggestion(freezeIfNeeded(ref.current, frozen), k)
    commit(next)
    onAppliedRef.current([{ key: k, text: next.report.sections[k].text }])
  }, [commit, frozen])

  const reject = useCallback(
    (k: SectionKey) => commit(rejectSuggestion(ref.current, k)),
    [commit],
  )

  const resumeAi = useCallback(
    (k: SectionKey) => commit(resumeAiManagement(ref.current, k)),
    [commit],
  )

  const adopt = useCallback(
    (data: StructuredReportData) => commit(adoptReportData(ref.current, data)),
    [commit],
  )

  return {
    sections: liveSections(coord),
    flags: coord.flags,
    reportFlags: coord.reportFlags,
    suggestions: coord.suggestions,
    owned: physicianOwnedSections(coord),
    active: coord.appliedRevision > 0,
    submit,
    notePhysicianEdit,
    accept,
    reject,
    resumeAi,
    adopt,
  }
}

/** Carry a mid-session finalization into the domain state itself. */
function freezeIfNeeded(state: LiveCoordinatorState, frozen: boolean): LiveCoordinatorState {
  return frozen && !state.frozen ? freeze(state) : state
}
